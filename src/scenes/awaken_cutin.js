// 각성기 컷인 장면 'awakenCutin' — owner: AWAKEN-CORE (feel.md §6.2, §6.3, §6.6, §7; MASTER_PLAN §1.13)
//  game.push('awakenCutin', { world, p, charId, classId, tier, short, onDone(aborted) })
//  opaque=false · hidePad · deferToasts · world.hudHidden. 월드는 멈춰 있고(맨 위 장면만 갱신) 이 장면이 그 위에 그린다.
//  전체 1.45초 / 짧게 0.75초 (설정 cutinMode 'short' 또는 같은 스테이지 두 번째 각성부터). 0.5초 뒤 아무 버튼이나 누르면 퇴장(1.30)으로 건너뛴다.
//  끝나면 먼저 pop 한 뒤 onDone(false) — 각성 감독이 시작된다. 장면이 통째로 닫히면(go 등) onDone(true).
//  시간표 (전체): 0.00 암전·영웅 강조·awaken_charge · 0.08 집중선·카메라 연출 구도 · 0.22 띠 진입 · 0.26 일러스트 · 0.50 눈빛
//               0.42–1.00 시그니처 대사를 한 글자씩 찍음(붓글씨) → 붉은 낙관 · 1.05 스팅어 · 1.30 띠 퇴장·섬광·'각성 — 이름' · 1.45 종료
//  띠: (vw/2, 0.47·vh) 를 지나는 −7° 사선, 높이 0.40·vh, 배경(그라데이션+망점)은 한 번 구워 둔 캔버스 (매 프레임 drawImage 몇 번뿐).
//  일러스트: assets/cg/cutin_<id>.webp (폭 1.15·vw, 얼굴 기준점을 (0.66·vw, 0.47·vh) 에), 없으면 초상(portraits/<id>) 으로 대신한다.
//  글자는 FONT.brush (BN Brush, 필요할 때 받음) 로 한 번 구워 조각으로 찍는다. 붓글씨가 늦게 도착하면 다시 굽는다.
//  prepareCutin(charId, tier) — awaken.js 가 스테이지 시작 무렵 불러 글꼴·캔버스·글자를 미리 준비한다 (첫 컷인이 끊기지 않게).
// 스택에 혼자 남는 경우(?scene=awakenCutin 디버그 주소)에는 검은 바탕 위에 미리보기로 그린 뒤 타이틀로 간다.
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { FONT, loadBrush, faceReady } from '../core/ui.js';
import { clamp, ease, rgba, rand, TAU, lerp } from '../core/math.js';
import { AWAKEN, AWAKEN_RULES, awakenTitle } from '../data/awaken.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import { drawHero } from '../render/hero.js';

const DEG = Math.PI / 180;
const ANG = -7 * DEG;                      // 띠 기울기 (오른쪽이 올라간다)
const COS = Math.cos(ANG), SIN = Math.sin(ANG);
const GOLD = '#e8c872', SEAL_RED = '#b0102a', INK = '#1a0006', INK_SHADOW = '#5a0010';
const GLYPH_T = 0.09;                      // 한 글자가 1.8 → 1 배로 찍히는 시간

/** 시간표 (초) */
const FULL = { dim: 0.12, lines: 0.08, cine: 0.3, band: 0.22, bandIn: 0.16, img: 0.26, imgIn: 0.2, glint: 0.5, text0: 0.42, text1: 1.0, stinger: 1.05, exit: 1.3, exitDur: 0.14, end: AWAKEN_RULES.cutin.full, short: false };
const SHORT = { dim: 0.1, lines: 0.06, cine: 0.15, band: 0.1, bandIn: 0.12, img: 0.12, imgIn: 0.16, glint: 0.3, text0: 0.3, text1: 0.42, stinger: 0.55, exit: 0.62, exitDur: 0.1, end: AWAKEN_RULES.cutin.short, short: true };

// ───────────────────────── 캔버스 풀 (스테이지 시작 무렵 한 번 만들고 다시 쓴다) ─────────────────────────
const POOL = new Map();
function pooled(name, w, h) {
  if (typeof document === 'undefined') return null;
  let c = POOL.get(name);
  if (!c) { c = document.createElement('canvas'); POOL.set(name, c); }
  w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else c.getContext('2d').clearRect(0, 0, w, h);
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  return c;
}
const game = () => (typeof window !== 'undefined' ? window.__game : null);
function qualityNow() {
  const g = game();
  const q = g?.quality ?? g?.tier ?? g?.settings?.quality ?? 'high';
  return q === 'low' || q === 'medium' ? q : 'high';
}
/** 논리 px → 백킹 px 배율 (굽는 해상도), 1..2 */
function bakeScale(ctx) {
  let s = Number(game()?.scale);
  if (!(s > 0)) { try { const m = (ctx ?? game()?.ctx)?.getTransform?.(); s = m ? Math.hypot(m.a, m.b) || 1 : 1; } catch { s = 1; } }
  return clamp(s, 1, 2);
}

// ── 한 번 굽는 공용 그림: 집중선·눈빛 섬광·왼쪽 어둠 ──
let SPRITES = null;
function sprites() {
  if (SPRITES || typeof document === 'undefined') return SPRITES;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  // 집중선: 중심이 빈 64개의 가는 쐐기
  const radial = mk(512, 512), rg = radial.getContext('2d');
  rg.translate(256, 256);
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * TAU + rand(-0.03, 0.03), w = rand(0.006, 0.02), r0 = rand(70, 130);
    rg.fillStyle = `rgba(255,255,255,${rand(0.25, 0.9).toFixed(2)})`;
    rg.beginPath(); rg.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    rg.lineTo(Math.cos(a - w) * 256, Math.sin(a - w) * 256); rg.lineTo(Math.cos(a + w) * 256, Math.sin(a + w) * 256); rg.closePath(); rg.fill();
  }
  rg.globalCompositeOperation = 'destination-out';
  const hole = rg.createRadialGradient(0, 0, 40, 0, 0, 170);
  hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
  rg.fillStyle = hole; rg.fillRect(-256, -256, 512, 512);
  // 눈빛 섬광: 네 갈래 빛 + 둥근 광채
  const flare = mk(160, 160), fg = flare.getContext('2d');
  const glow = fg.createRadialGradient(80, 80, 0, 80, 80, 44);
  glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.25, 'rgba(255,245,220,0.7)'); glow.addColorStop(1, 'rgba(255,220,180,0)');
  fg.fillStyle = glow; fg.fillRect(0, 0, 160, 160);
  const spike = (len, wd, rot) => {
    fg.save(); fg.translate(80, 80); fg.rotate(rot);
    const lg = fg.createLinearGradient(-len, 0, len, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    fg.fillStyle = lg; fg.beginPath(); fg.moveTo(-len, 0); fg.lineTo(0, -wd); fg.lineTo(len, 0); fg.lineTo(0, wd); fg.closePath(); fg.fill();
    fg.restore();
  };
  spike(80, 3.2, 0); spike(58, 2.6, Math.PI / 2); spike(30, 1.6, Math.PI / 4); spike(30, 1.6, -Math.PI / 4);
  // 일러스트 왼쪽 어둠 (글자가 읽히게): 검정 0.75 → 0
  const fade = mk(256, 2), dg = fade.getContext('2d');
  const lg = dg.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, 'rgba(0,0,0,0.75)'); lg.addColorStop(0.55, 'rgba(0,0,0,0.42)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
  dg.fillStyle = lg; dg.fillRect(0, 0, 256, 2);
  SPRITES = { radial, flare, fade };
  return SPRITES;
}

// ───────────────────────── 굽기 ─────────────────────────
function bandSize(vw, vh) { return { H: Math.round(vh * 0.4), L: Math.ceil(vw / COS + 200) }; }

/** 띠 바탕: 검정 → 영웅 어두운 색 그라데이션 + 망점 + 위아래 그늘 (띠 좌표, 가운데 기준) */
function bakeBand(a, vw, vh, S) {
  const { H, L } = bandSize(vw, vh);
  const c = pooled('band', L * S, H * S);
  if (!c) return null;
  const g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  const gr = g.createLinearGradient(0, 0, L, 0);
  gr.addColorStop(0, '#000000'); gr.addColorStop(0.42, '#050104'); gr.addColorStop(1, a.dark ?? '#1a0508');
  g.fillStyle = gr; g.fillRect(0, 0, L, H);
  // 망점 (오른쪽·가장자리로 갈수록 굵게)
  g.fillStyle = rgba(a.color, 0.18);
  g.beginPath();
  const step = 9;
  for (let row = 0, y = 4; y < H; y += step, row++) {
    const ey = Math.abs(y / H - 0.5) * 2;
    for (let x = row % 2 ? step / 2 : 0; x < L; x += step) {
      const r = 0.25 + 2.7 * Math.pow(x / L, 1.4) * (0.45 + 0.55 * ey);
      if (r < 0.45) continue;
      g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
    }
  }
  g.fill();
  // 위아래 그늘
  const sh = g.createLinearGradient(0, 0, 0, H);
  sh.addColorStop(0, 'rgba(0,0,0,0.55)'); sh.addColorStop(0.18, 'rgba(0,0,0,0)'); sh.addColorStop(0.82, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = sh; g.fillRect(0, 0, L, H);
  return { c, L, H };
}

/** 한 줄을 붓글씨로 굽는다 → {c, w, h, pad, asc, cuts[], glyphs[] (공백 제외 조각 번호)} */
function bakeLine(name, str, size, S, { glow = null } = {}) {
  const probe = pooled('probe', 8, 8);
  if (!probe) return null;
  const pg = probe.getContext('2d');
  const fontStr = `400 ${size}px ${FONT.brush}`;
  pg.font = fontStr;
  const chars = [...str];
  const pre = [0];
  for (let i = 1; i <= chars.length; i++) pre.push(pg.measureText(chars.slice(0, i).join('')).width);
  const tw = pre[chars.length];
  const pad = Math.ceil(size * 0.35 + 8);
  const w = Math.ceil(tw + pad * 2), h = Math.ceil(size * 1.45 + pad);
  const asc = Math.ceil(size * 1.02 + pad * 0.5);
  const c = pooled(name, w * S, h * S);
  const g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  g.font = fontStr; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.miterLimit = 2;
  // 먹 그림자 → 두꺼운 테 → (광채) → 흰 글자
  g.fillStyle = INK_SHADOW; g.fillText(str, pad + 3, asc + 3);
  g.strokeStyle = INK; g.lineWidth = Math.max(4, size * 0.15); g.strokeText(str, pad, asc);
  if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.3; }
  g.fillStyle = '#ffffff'; g.fillText(str, pad, asc);
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  g.strokeStyle = '#ffffff'; g.lineWidth = Math.max(1, size * 0.03); g.strokeText(str, pad, asc);   // 가는 붓획을 조금 두껍게
  // 아래쪽 옅은 붉은 번짐 (피 먹물 느낌)
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, asc - size * 0.2, 0, asc + size * 0.2);
  lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(255,190,190,0.35)');
  g.fillStyle = lg; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  const cuts = [0];
  for (let i = 1; i < chars.length; i++) cuts.push(pad + pre[i]);
  cuts.push(w);
  const glyphs = [];
  chars.forEach((ch, i) => { if (ch.trim()) glyphs.push(i); });
  return { c, S, w, h, pad, asc, tw, size, cuts, glyphs, str };
}

/** 붉은 낙관 (54×54, 흰 한자) */
function bakeSeal(ch, S) {
  const c = pooled('seal', 72 * S, 72 * S);
  if (!c) return null;
  const g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  g.translate(36, 36);
  g.fillStyle = SEAL_RED;
  g.beginPath();
  // 살짝 거친 네모 (도장 가장자리)
  const pts = 28;
  for (let i = 0; i <= pts; i++) {
    const t = i / pts, side = Math.floor(t * 4) % 4, u = (t * 4) % 1, j = rand(-1.2, 1.2);
    const x = side === 0 ? -27 + 54 * u : side === 1 ? 27 + j : side === 2 ? 27 - 54 * u : -27 + j;
    const y = side === 0 ? -27 + j : side === 1 ? -27 + 54 * u : side === 2 ? 27 + j : 27 - 54 * u;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,235,225,0.75)'; g.lineWidth = 2; g.strokeRect(-22, -22, 44, 44);
  g.fillStyle = '#fff6ee'; g.font = `900 34px ${FONT.title}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(ch, 0, 2);
  // 인주가 덜 묻은 자국
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(0,0,0,${rand(0.15, 0.5).toFixed(2)})`; g.beginPath(); g.arc(rand(-27, 27), rand(-27, 27), rand(0.6, 2.2), 0, TAU); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  return { c, S, w: 72, h: 72 };
}

/** 퇴장 제목: 작은 금색 머리말 + '각성 — 이름' (흰 글자·붉은 테·피 흘러내리는 밑줄) */
function bakeTitle(caption, str, vw, S, a) {
  const probe = pooled('probe', 8, 8);
  if (!probe) return null;
  const pg = probe.getContext('2d');
  let size = 48;
  pg.font = `400 ${size}px ${FONT.brush}`;
  let tw = pg.measureText(str).width;
  const maxW = vw - 120;
  if (tw > maxW) { size = Math.max(30, Math.floor(size * maxW / tw)); pg.font = `400 ${size}px ${FONT.brush}`; tw = pg.measureText(str).width; }
  const capSize = 17;
  pg.font = `700 ${capSize}px ${FONT.title}`;
  const cw = pg.measureText(caption).width;
  const W = Math.ceil(Math.max(tw, cw) + 80), Hh = Math.ceil(size * 2.3 + 40);
  const c = pooled('title', W * S, Hh * S);
  const g = c.getContext('2d');
  g.setTransform(S, 0, 0, S, 0, 0);
  const cx = W / 2, base = capSize + 14 + size;
  // 머리말
  g.font = `700 ${capSize}px ${FONT.title}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 4; g.strokeText(caption, cx, capSize + 4);
  g.fillStyle = GOLD; g.fillText(caption, cx, capSize + 4);
  // 밑줄 붓질 (피)
  const uy = base + size * 0.22, ux0 = cx - tw * 0.54, ux1 = cx + tw * 0.54;
  g.fillStyle = '#7a0012';
  g.beginPath(); g.moveTo(ux0, uy); g.quadraticCurveTo(cx, uy - 5, ux1, uy - 2); g.lineTo(ux1 - 10, uy + 7); g.quadraticCurveTo(cx, uy + 9, ux0 + 16, uy + 8); g.closePath(); g.fill();
  g.fillStyle = '#c0142a';
  g.beginPath(); g.moveTo(ux0 + 8, uy + 1); g.quadraticCurveTo(cx, uy - 3, ux1 - 6, uy); g.lineTo(ux1 - 16, uy + 4); g.quadraticCurveTo(cx, uy + 5, ux0 + 20, uy + 5); g.closePath(); g.fill();
  for (let i = 0; i < 7; i++) {   // 흘러내린 방울
    const x = lerp(ux0 + 20, ux1 - 20, (i + rand(0.2, 0.8)) / 7), len = rand(6, 22), w = rand(2, 3.6);
    g.fillStyle = '#8e0a1e'; g.fillRect(x - w / 2, uy + 3, w, len);
    g.beginPath(); g.arc(x, uy + 3 + len, w * 0.95, 0, TAU); g.fill();
  }
  // 글자: 짙은 바깥 테 → 붉은 테 → 흰 글자
  g.font = `400 ${size}px ${FONT.brush}`;
  g.strokeStyle = INK; g.lineWidth = 11; g.strokeText(str, cx, base);
  g.strokeStyle = SEAL_RED; g.lineWidth = 5; g.strokeText(str, cx, base);
  g.shadowColor = rgba(a?.color ?? '#ffffff', 0.8); g.shadowBlur = 14;
  g.fillStyle = '#ffffff'; g.fillText(str, cx, base);
  g.shadowColor = 'transparent'; g.shadowBlur = 0;
  return { c, S, w: W, h: Hh, base };
}

/** 초상 대체용: 초상(2:3)을 한 번 그려 네 가장자리를 투명하게 녹인다 (띠 안에서 네모 테두리가 보이지 않게) */
function featherPortrait(img) {
  const iw = img?.naturalWidth || img?.width || 0, ih = img?.naturalHeight || img?.height || 0;
  if (!(iw > 8 && ih > 8)) return null;
  const h = 420, w = Math.max(8, Math.round(h * iw / ih));
  const c = pooled('fallback', w, h);
  if (!c) return null;
  const g = c.getContext('2d');
  try { g.drawImage(img, 0, 0, w, h); } catch { return null; }
  g.globalCompositeOperation = 'destination-in';
  const gx = g.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(0.3, 'rgba(0,0,0,1)'); gx.addColorStop(0.78, 'rgba(0,0,0,1)'); gx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gx; g.fillRect(0, 0, w, h);
  const gy = g.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.12, 'rgba(0,0,0,1)'); gy.addColorStop(0.62, 'rgba(0,0,0,1)'); gy.addColorStop(0.9, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return { c, w, h };
}

/** 한 영웅의 글자 굽기 묶음 (띠 폭에 맞춘 크기) */
function bakeText(a, vw, S, tier, charId, classId) {
  const zoneW = vw * 0.47;
  const n = a.lines.length;
  const probe = pooled('probe', 8, 8);
  if (!probe) return null;
  const pg = probe.getContext('2d');
  const fit = (str, want, min) => { pg.font = `400 ${want}px ${FONT.brush}`; const w = pg.measureText(str).width; return w > zoneW ? Math.max(min, Math.floor(want * zoneW / w)) : want; };
  const P0 = vw >= 1100 ? 64 : 58;   // 붓글씨(East Sea Dokdo)는 글자가 좁고 가늘어 명세의 40/44 px 보다 크게 쓴다 (글자 칸 폭에 맞춰 줄인다)
  const P = fit(a.lines[n - 1], P0, 30);
  const leadMax = Math.round(P0 * 0.6);
  const leadSize = Math.min(...a.lines.slice(0, n - 1).map((s) => fit(s, leadMax, 20)), leadMax);
  const lines = a.lines.map((s, i) => bakeLine('line' + i, s, i === n - 1 ? P : leadSize, S, { glow: i === n - 1 ? rgba(a.color, 0.9) : null }));
  const seal = bakeSeal(a.seal, S);
  const ch = CHARACTERS[charId];
  const cls = CLASSES[classId];
  const caption = [ch?.name, cls?.name].filter(Boolean).join(' · ');
  const title = bakeTitle(caption, awakenTitle(charId, tier), vw, S, a);
  return { lines, seal, title, P, leadSize, brush: faceReady('BN Brush') };
}

// 준비 상태 (prepareCutin → 장면 enter 가 이어받는다)
const PREP = { key: '', band: null, text: null };
function prepKey(charId, tier, classId, vw, S) { return `${charId}|${tier}|${classId}|${vw}|${S}|${faceReady('BN Brush') ? 1 : 0}`; }
function ensureBaked(charId, tier, classId, vw, vh, S) {
  const a = AWAKEN[charId];
  if (!a) return null;
  const key = prepKey(charId, tier, classId, vw, S);
  if (PREP.key === key && PREP.band && PREP.text) return PREP;
  sprites();
  PREP.band = bakeBand(a, vw, vh, Math.min(S, 1.25));
  PREP.text = bakeText(a, vw, S, tier, charId, classId);
  PREP.key = key;
  return PREP;
}

/**
 * 스테이지 시작 무렵 한 번 (awaken.js prepareAwakening): 붓글씨를 받고, 한가할 때 캔버스·글자를 미리 굽는다.
 * 첫 각성 컷인이 끊기지 않게 하는 용도 (feel §6.2 hitch prevention).
 */
export function prepareCutin(charId, tier = 1) {
  if (!AWAKEN[charId] || typeof document === 'undefined') return;
  const run = () => {
    try {
      const g = game();
      const p = g?.world?.player;
      const classId = p?.hero?.charId === charId ? p.hero.classId : null;
      ensureBaked(charId, tier, classId, g?.viewW ?? 960, g?.viewH ?? 540, bakeScale(g?.ctx));
    } catch (e) { console.error('[awakenCutin] 미리 굽기', e); }
  };
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 400));
  Promise.resolve(loadBrush()).then(() => idle(run), () => idle(run));
}

// ───────────────────────── 장면 ─────────────────────────
export class AwakenCutinScene extends Scene {
  constructor(game) {
    super(game);
    this.opaque = false;
    this.hidePad = true;
    this.deferToasts = true;
    this.done = false;
  }

  enter(params = {}) {
    const g = this.game;
    this.params = params;
    this.w = params.world ?? g.world ?? null;
    this.p = params.p ?? this.w?.player ?? null;
    let charId = params.charId ?? this.p?.hero?.charId;
    if (!AWAKEN[charId]) charId = params.char ?? (typeof location !== 'undefined' ? new URLSearchParams(location.search).get('char') : null) ?? 'kael';
    if (!AWAKEN[charId]) charId = 'kael';
    this.charId = charId;
    this.a = AWAKEN[charId];
    this.classId = params.classId ?? this.p?.hero?.classId ?? CHARACTERS[charId]?.rootClass;
    this.tier = params.tier ?? CLASSES[this.classId]?.tier ?? 1;
    this.preview = !this.w || !this.p;   // 월드 없이 떠 있음 (디버그 주소) → 검은 바탕 미리보기
    if (this.preview) this.opaque = true;
    this.T = params.short ? SHORT : FULL;
    this.renderedText = this.a.lines.join(' ');   // 시험용 (= AWAKEN[id].line)
    if (this.w) { this.w.hudHidden = true; this.w.cutscene = true; }
    this.cam = this.w?.camera ?? null;
    this.q = qualityNow();
    this.reduce = !!g.settings?.reduceMotion;
    this.vw = g.viewW; this.vh = g.viewH;
    this.S = bakeScale(g.ctx);
    try { loadBrush()?.then?.((ok) => { if (ok) this.fontArrived = true; }); } catch { /* 글꼴 없음 */ }
    this.bake();
    this.pickImage();
    this.heroSnap = null;
    try { this.heroSnap = this.p?.snapshot?.() ?? null; } catch { this.heroSnap = null; }
    this.ink = [];
    this.fired = new Set();
    this.shakeT = 0; this.shakeA = 0;
    this.sfx('awaken_charge');
    if (!this.preview) { try { input.rumble?.(0.3, 0.45, 140); } catch { /* 진동 없음 */ } }
  }

  bake() {
    const prep = ensureBaked(this.charId, this.tier, this.classId, this.game.viewW, this.game.viewH, this.S);
    this.band = prep?.band ?? null;
    this.text = prep?.text ?? null;
    this.vw = this.game.viewW; this.vh = this.game.viewH;
    this.layoutText();
  }
  resize() { if (this.vw !== this.game.viewW || this.vh !== this.game.viewH) this.bake(); }

  /** 컷인 그림 (없으면 초상: 가장자리를 부드럽게 녹인 사본을 한 번 굽는다) */
  pickImage() {
    const a = this.a;
    const ok = (im) => im && (im.naturalWidth || im.width) > 8;
    const img = assets.get(a.cutin);
    if (ok(img)) { this.img = img; this.fallback = false; this.fb = null; this.face = a.face; this.eye = a.eye; return; }
    const por = assets.get(a.portrait);
    const next = ok(por) ? por : null;
    if (next !== this.img || !this.fb) this.fb = next ? featherPortrait(next) : null;
    this.img = next;
    this.fallback = true;
    this.face = a.portraitFace ?? [0.5, 0.3];
    this.eye = [this.face[0] + 0.02, this.face[1] - 0.03];
  }

  /** 글자 배치 (띠 좌표: 가운데 (vw/2, 0.47·vh), −7° 회전 안) */
  layoutText() {
    const tx = this.text;
    if (!tx) { this.lay = null; return; }
    const vw = this.vw, n = tx.lines.length;
    const x0 = vw * 0.05 - vw / 2;
    const P = tx.P, lead = tx.leadSize, H = bandSize(vw, this.vh).H;
    // 줄 묶음을 이름표 아래 ~ 띠 아래 가장자리 사이 가운데에 (띠 좌표 y: 아래가 +)
    const gapPL = P * 0.98, gapLL = lead * 1.16, m = n - 1;
    const top0 = -H / 2 + 38, bot0 = H / 2 - 14;
    const blockH = (m > 0 ? lead * 0.8 + (m - 1) * gapLL + gapPL : P * 0.8) + P * 0.18;
    const yP = (top0 + bot0) / 2 + blockH / 2 - P * 0.18;
    const rows = tx.lines.map((L, i) => {
      if (!L) return null;
      const y = i === n - 1 ? yP : yP - gapPL - (n - 2 - i) * gapLL;
      return { L, x: x0, y };
    });
    // 한 글자씩 찍는 시각
    const total = tx.lines.reduce((s, L) => s + (L ? L.glyphs.length : 0), 0) || 1;
    const T = this.T;
    const dtG = T.short ? 0 : Math.min(0.03, Math.max(0.012, (T.text1 - T.text0 - GLYPH_T) / total));
    let k = 0;
    for (const r of rows) { if (!r) continue; r.t0 = T.text0 + k * dtG; r.dt = dtG; k += r.L.glyphs.length; }
    const last = rows[n - 1];
    const sealT = T.short ? T.text0 + 0.06 : T.text0 + total * dtG + 0.06;
    this.lay = { rows, dtG, total, sealT, sealX: last ? last.x + last.L.pad + last.L.tw + 10 + 27 : 0, sealY: last ? last.y - P * 0.36 : 0 };
  }

  sfx(name, o) { try { audio.sfx(audio.has?.(name) === false ? 'magic' : name, o); } catch { /* 무시 */ } }
  once(key, t, fn) { if (this.t >= t && !this.fired.has(key)) { this.fired.add(key); fn(); } }

  update(dt) {
    const T = this.T, t = this.t;
    if (this.cam) { try { this.cam.tick?.(dt); } catch (e) { console.error(e); } }
    if (this.fontArrived && this.text && !this.text.brush) { this.fontArrived = false; PREP.key = ''; this.bake(); }
    // 그림이 아직 안 왔으면(또는 초상으로 대신하는 중이면) 일러스트가 들어오기 직전까지 다시 본다
    if ((!this.img && t < 1) || (this.fallback && t < T.img + 0.03)) this.pickImage();
    if (this.shakeT > 0) this.shakeT -= dt;
    // 시전 자세를 들어 올린 상태까지만 진행 (월드는 멈춰 있다)
    const p = this.p;
    if (p?.move?.id === 'aw_cast' && p.moveT < 0.45) { p.moveT += dt; p.animT += dt; }
    // ── 시간표 ──
    this.once('cine', T.lines, () => { if (this.cam && p && !this.reduce) this.cam.cine?.(p, 1.22, T.cine); });
    this.once('band', T.band, () => this.sfx('cutin_whoosh'));
    this.once('glint', T.glint, () => this.sfx('eye_glint'));
    const lead = audio.lead?.('awaken_stinger') ?? 0.4;
    this.once('stinger', Math.max(T.text0, T.stinger - lead), () => this.sfx('awaken_stinger'));
    this.once('band_flash', T.stinger, () => { if (!this.preview) { try { input.rumble?.(0.6, 0.9, 400); } catch { /* 없음 */ } } this.kick(5); });
    if (this.lay) {
      if (T.short) this.once('brush', T.text0, () => this.sfx('brush_stroke'));
      else {
        let gi = 0;
        for (const r of this.lay.rows) {
          if (!r) continue;
          for (let j = 0; j < r.L.glyphs.length; j++, gi++) {
            const tg = r.t0 + j * r.dt;
            const idx = gi;
            this.once('g' + idx, tg, () => {
              if (idx % 3 === 0) this.sfx('brush_stroke', { pitch: rand(0.9, 1.1) });
              this.spawnInk(r, r.L.glyphs[j]);
            });
          }
        }
      }
      this.once('seal', this.lay.sealT, () => { this.sfx('seal_stamp'); this.kick(7); this.spawnInk(null, -1); });
    }
    this.once('exit', T.exit, () => {
      this.sfx('cutin_whoosh', { pitch: 0.8 });
      this.sfx(audio.has?.('impact_frame') ? 'impact_frame' : 'hit_heavy', { vol: 0.8 });
      this.game.flash?.('#ffffff', 0.5, 3.5);
      this.kick(9);
    });
    // 먹물 방울
    for (const k of this.ink) { k.t += dt; k.x += k.vx * dt; k.y += k.vy * dt; k.vy += 420 * dt; k.vx *= 0.94; }
    if (this.ink.length) this.ink = this.ink.filter((k) => k.t < k.life);
    // 건너뛰기: 0.5초 뒤 아무 버튼 → 퇴장
    if (t > AWAKEN_RULES.cutin.skipAfter && t < T.exit && (input.anyPressed?.() || input.pointer?.tapped)) this.skip();
    if (this.t >= T.end) this.finish(false);
  }

  /** 퇴장(1.30)으로 건너뛴다: 그 사이 소리는 조용히 넘기고 글자·낙관은 다 찍힌 상태로 */
  skip() {
    const T = this.T;
    for (let i = 0; i < 400; i++) this.fired.add('g' + i);
    for (const k of ['cine', 'band', 'glint', 'stinger', 'band_flash', 'brush', 'seal']) this.fired.add(k);
    this.t = T.exit;
  }
  kick(a) {
    if (this.reduce) a *= 0.4;
    this.shakeA = this.shakeT > 0 ? Math.max(this.shakeA * this.shakeT / 0.14, a) : a;
    this.shakeT = 0.14;
  }

  spawnInk(r, gi) {
    if (this.q === 'low') return;
    const n = gi < 0 ? 8 : 3;
    let x, y;
    if (gi < 0) { x = this.lay.sealX; y = this.lay.sealY; } else {
      const L = r.L;
      x = r.x + (L.cuts[gi] + L.cuts[gi + 1]) / 2;
      y = r.y - L.size * 0.35;
    }
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(60, gi < 0 ? 260 : 180);
      this.ink.push({ x: x + rand(-8, 8), y: y + rand(-8, 8), vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, r: rand(1.4, gi < 0 ? 4.8 : 3.6), t: 0, life: rand(0.35, 0.6), c: Math.random() < 0.5 ? '#6a0010' : '#12000a' });
    }
    if (this.ink.length > 60) this.ink.splice(0, this.ink.length - 60);
  }

  /** 끝: 먼저 장면을 닫고(onDone 이 다른 장면을 쌓아도 안전) 감독을 시작한다 */
  finish(aborted) {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    try { this.cam?.cineEnd?.(0.3); } catch (e) { console.error(e); }
    if (!aborted && this.w && this.text?.title) this.titleOverlay();
    if (this.preview) {
      if (g.top === this) { if (g.scenes.length <= 1) g.go('title', {}, { fade: false }); else g.pop(); }
    } else if (g.top === this) g.pop();
    try { this.params.onDone?.(!!aborted); } catch (e) { console.error('[awakenCutin] onDone', e); }
  }
  exit() {
    // 장면이 통째로 닫힌 경우 (go 등): 감독 없이 연출 상태만 되돌리게 한다
    if (!this.done) {
      this.done = true;
      try { this.cam?.cineEnd?.(0.2); } catch { /* 무시 */ }
      try { this.params?.onDone?.(true); } catch (e) { console.error('[awakenCutin] onDone', e); }
    }
  }

  /** 팝 뒤에도 0.45초 동안 제목이 월드 위에서 사라진다 (world.overlays) */
  titleOverlay() {
    const tt = this.text.title, vw = this.vw, vh = this.vh;
    const w = this.w;
    w.addOverlay?.({
      life: 0.45,
      draw(ctx) {
        const k = clamp(this.t / 0.45, 0, 1);
        const s = 1 + 0.04 * k;
        ctx.globalAlpha = (1 - k) * (1 - k * 0.3);
        const dw = tt.w * s, dh = tt.h * s;
        ctx.drawImage(tt.c, vw / 2 - dw / 2, vh * 0.28 - tt.base * s - 10 * k, dw, dh);
        ctx.globalAlpha = 1;
      },
    });
  }

  // ─────────────────────────── 그리기 ───────────────────────────
  render(ctx) {
    if (!this.a) return;
    const vw = this.game.viewW, vh = this.game.viewH, t = this.t, T = this.T;
    if (vw !== this.vw || vh !== this.vh) this.bake();
    const a = this.a;
    const sp = sprites();
    ctx.save();
    // 1. 암전 + 영웅 어두운 색 물들임: 한 번의 전면 채우기 (특수 합성 없음 — feel §8 전면 패스·합성 예산).
    //    검정 0.6 위에 dark 0.22 를 얹은 결과와 같은 색을 미리 섞어 둔다 (low 는 검정만)
    const dk = clamp(t / T.dim, 0, 1) * (t > T.exit ? lerp(1, 0.55, clamp((t - T.exit) / (T.end - T.exit), 0, 1)) : 1);
    if (this.preview) { ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, vw, vh); }
    if (dk > 0.003) { ctx.fillStyle = this.dimFill(dk); ctx.fillRect(0, 0, vw, vh); }
    // 2. 영웅 주변 집중선 — 화면을 거의 덮는 큰 합성이므로 low 에서는 그리지 않는다 (feel §8: low 전면 패스 1장 = 암전뿐;
    //    ULTFX 도 low 에서는 화면 층이 없다). 움직임은 띠 속 속도선이 맡는다
    if (sp && this.q !== 'low' && t >= T.lines && t < T.exit + T.exitDur) {
      const hs = this.heroScreen();
      const k = clamp((t - T.lines) / 0.18, 0, 1) * (t > T.exit ? 1 - clamp((t - T.exit) / T.exitDur, 0, 1) : 1);
      const R = Math.max(vw, vh) * 1.25;
      ctx.save(); ctx.translate(hs.x, hs.y); ctx.rotate(t * (this.reduce ? 0.05 : 0.35));
      ctx.globalAlpha = 0.6 * k;
      ctx.drawImage(sp.radial, -R, -R, R * 2, R * 2);
      ctx.restore();
    }
    // 3. 영웅을 암전 위로 다시 그림 (+ 흰 테 번쩍임). 불투명한 띠가 영웅을 통째로 가리는 동안에는 건너뛴다 (퍼펫 다시 그리기가 컷인 비용의 대부분)
    if (!this.preview && this.p && !this.heroHidden(vw, vh, t)) this.drawHeroOver(ctx, t);
    // 4. 영화 띠 (위아래 검은 막)
    const lb = 34 * ease.outCubic(clamp(t / 0.15, 0, 1)) * (t > T.exit ? 1 - clamp((t - T.exit) / (T.end - T.exit), 0, 1) : 1);
    if (lb > 0.5) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, lb); ctx.fillRect(0, vh - lb, vw, lb); }
    // 5. 컷인 띠 + 일러스트 + 글자
    if (t >= T.band && t < T.exit + T.exitDur + 0.02) this.drawBand(ctx, vw, vh, t);
    // 6. 퇴장 제목
    if (t >= T.exit) this.drawTitle(ctx, vw, vh, t);
    ctx.restore();
  }

  /** 암전 색: 검정(0.6) 위에 영웅 dark(0.22, low 는 없음)를 겹친 결과를 한 색으로 (dk 배율). 문자열은 dk 단계별로 캐시 */
  dimFill(dk) {
    const q = Math.round(dk * 40);
    if (this._dimQ === q && this._dimS) return this._dimS;
    const k = q / 40, a1 = 0.6 * k, a2 = this.q === 'low' ? 0 : 0.22 * k;
    const h = String(this.a.dark ?? '#000').replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
    const A = a1 + a2 * (1 - a1);   // 두 겹의 합성 알파
    const mix = (c) => Math.round(A > 0 ? (c * a2) / A : 0);
    this._dimQ = q; this._dimS = `rgba(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)},${A.toFixed(3)})`;
    return this._dimS;
  }

  heroScreen() {
    const p = this.p, cam = this.cam;
    if (!p || !cam) return { x: this.game.viewW * 0.5, y: this.game.viewH * 0.55 };
    const z = cam._zoom ?? cam.zoom ?? 1;
    return { x: (p.cx - cam.x) * z, y: (p.cy - cam.y) * z };
  }

  /**
   * 띠가 자리를 잡은 동안(들어온 뒤 ~ 퇴장 전, 흰 번쩍임이 끝난 뒤) 영웅의 화면 사각형이 불투명한 띠 안쪽에 통째로 들어가는가.
   * 여유: 옆 64 · 위 52 · 아래 20 (월드 px; 시전 자세의 무기 끝 ≈ 28 · 발밑 마법진 반지름 ≈ 58 · 아래 14 를 재어 두 배 가까이 둔다)
   */
  heroHidden(vw, vh, t) {
    const T = this.T, p = this.p, cam = this.cam;
    if (!p || !cam || t < Math.max(T.band + T.bandIn, 0.36) || t >= T.exit) return false;
    const z = cam._zoom ?? cam.zoom ?? 1;
    if (!(z > 0)) return false;
    const sx = cam.x + (cam.shakeX ?? 0), sy = cam.y + (cam.shakeY ?? 0);
    const x0 = (p.x - 64 - sx) * z, x1 = (p.x + p.w + 64 - sx) * z;
    const y0 = (p.y - 52 - sy) * z, y1 = (p.y + p.h + 20 - sy) * z;
    const lim = bandSize(vw, vh).H / 2 - 6 - (this.shakeT > 0 ? this.shakeA : 0);
    const ox = vw / 2, oy = vh * 0.47;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) {
      if (Math.abs(-(x - ox) * SIN + (y - oy) * COS) > lim) return false;   // 띠 좌표의 세로 (−7° 회전을 되돌림)
    }
    return true;
  }

  drawHeroOver(ctx, t) {
    const p = this.p, cam = this.cam;
    ctx.save();
    try {
      cam.apply(ctx);
      drawHero(ctx, p, this.w, {});
      const fl = t < 0.05 ? t / 0.05 : clamp(1 - (t - 0.05) / 0.3, 0, 1);
      if (fl > 0.02 && this.heroSnap) {
        ctx.globalCompositeOperation = 'lighter';
        drawHero(ctx, this.heroSnap, this.w, { tint: '#ffffff', alpha: 0.85 * fl });
      }
      // 발밑 기운 고리
      const k = clamp(t / 0.12, 0, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(this.a.color, 0.4 * k); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.cx, p.bottom - 2, 46 + 10 * Math.sin(t * 9), 9, 0, 0, TAU); ctx.stroke();
    } catch (e) { console.error('[awakenCutin] hero', e); }
    ctx.restore();
  }

  /** 띠 무리 (띠 바탕·일러스트·어둠·줄무늬·글자·낙관·눈빛) */
  drawBand(ctx, vw, vh, t) {
    const T = this.T, a = this.a;
    const { H, L } = bandSize(vw, vh);
    const kIn = ease.outExpo(clamp((t - T.band) / T.bandIn, 0, 1));
    const kOut = ease.inCubic(clamp((t - T.exit) / T.exitDur, 0, 1));
    const slide = (1 - kIn) * (vw + 160);
    let ox = vw / 2 + slide * COS - kOut * vw * 1.15, oy = vh * 0.47 + slide * SIN - kOut * vh * 0.5;
    if (this.shakeT > 0) { const s = this.shakeA * (this.shakeT / 0.14); ox += rand(-s, s); oy += rand(-s, s); }
    const flashK = t >= T.stinger ? clamp(1 - (t - T.stinger) / 0.22, 0, 1) : 0;
    const landK = clamp(1 - (t - (T.band + T.bandIn)) / 0.18, 0, 1) * (t >= T.band + T.bandIn * 0.6 ? 1 : 0);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.rotate(ANG);
    // 띠 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-L / 2 + 10, -H / 2 + 12, L, H);
    // ── 띠 안쪽 (잘라내기) ──
    ctx.save();
    ctx.beginPath(); ctx.rect(-L / 2, -H / 2, L, H); ctx.clip();
    if (this.band) ctx.drawImage(this.band.c, -L / 2, -H / 2, L, H);
    else { ctx.fillStyle = a.dark; ctx.fillRect(-L / 2, -H / 2, L, H); }
    // 뒤쪽 속도선
    ctx.globalCompositeOperation = 'lighter';
    const nStreak = this.q === 'low' ? 8 : 16;
    for (let i = 0; i < nStreak; i++) {
      const len = 90 + (i * 53) % 170, y = -H / 2 + ((i * 97) % 100) / 100 * H;
      const x = ((i * 211 - t * 1800) % (L + 400) + (L + 400)) % (L + 400) - L / 2 - 200;
      ctx.fillStyle = `rgba(255,255,255,${(0.06 + ((i * 7) % 5) * 0.03).toFixed(2)})`;
      ctx.fillRect(x, y, len, i % 3 ? 1.5 : 3);
    }
    ctx.globalCompositeOperation = 'source-over';
    // 일러스트 (똑바로 세워 그린다: 회전을 되돌림)
    ctx.rotate(-ANG);
    const img = this.img;
    const imgK = ease.outExpo(clamp((t - T.img) / T.imgIn, 0, 1));
    const drift = -vw * 0.04 * clamp((t - T.img - T.imgIn) / Math.max(0.2, T.end - T.img - T.imgIn), 0, 1);
    const ix = (1 - imgK) * vw * 0.18 + drift;
    let eyeX = null, eyeY = null;
    if (t >= T.img) {
      ctx.globalAlpha = clamp((t - T.img) / 0.06, 0, 1);
      if (img && !this.fallback) {
        const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        const dw = vw * 1.15 * (1 + 0.03 * imgK), dh = dw * ih / iw;
        const fx = this.face[0], fy = this.face[1];
        const left = vw * 0.66 - fx * dw + ix - vw / 2, top = -fy * dh;
        ctx.drawImage(img, left, top, dw, dh);
        // 왼쪽 45% 어둠 (글자 자리)
        const sp = sprites();
        if (sp) {
          ctx.drawImage(sp.fade, left, -vh, dw * 0.45, vh * 2);
          if (left > -L / 2) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(-L / 2 - 50, -vh, left + L / 2 + 51, vh * 2); }
        }
        eyeX = left + this.eye[0] * dw; eyeY = top + this.eye[1] * dh;
      } else if (img && this.fb) {
        // 초상 대체 (feel §6.6): 가장자리를 녹인 초상을 띠 높이 0.9·H 이상으로, 얼굴을 같은 자리(0.66·vw)에.
        // 뒤에는 같은 그림을 크게 키운 영웅 색 잔상 → 좁은 초상도 띠를 가득 채운 연출로 보인다
        const fb = this.fb, dh = H * 1.6 * (1 + 0.03 * imgK), dw = dh * fb.w / fb.h;
        const fx = this.face[0], fy = this.face[1];
        const left = vw * 0.66 - fx * dw + ix - vw / 2, top = -H * 0.04 - fy * dh;
        const al = ctx.globalAlpha;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = al * 0.2;
        const ew = dw * 1.9, eh = dh * 1.9;
        ctx.drawImage(fb.c, left + dw * 0.5 - ew * 0.62 - vw * 0.03 * imgK, -eh * 0.36, ew, eh);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = al;
        ctx.drawImage(fb.c, left, top, dw, dh);
        eyeX = left + this.eye[0] * dw; eyeY = top + this.eye[1] * dh;
      } else {
        // 그림이 전혀 없을 때: 영웅 색 실루엣 광채 (예외 없이)
        ctx.fillStyle = rgba(a.color, 0.18);
        ctx.beginPath(); ctx.ellipse(vw * 0.16 + ix, -H * 0.05, H * 0.34, H * 0.45, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.rotate(ANG);
    // 스팅어·착지 번쩍임
    if (flashK > 0 || landK > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(a.color, 0.22 * flashK + 0.14 * landK);
      ctx.fillRect(-L / 2, -H / 2, L, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    // ── 줄무늬 (위: 영웅 색 6px, 10px 띄움 / 아래: 금 2px, 8px 띄움) ──
    const fw = flashK > 0 ? 1 : 0;
    ctx.fillStyle = fw ? mixWhite(a.color, flashK) : a.color;
    ctx.fillRect(-L / 2, -H / 2 - 16, L, 6);
    ctx.fillStyle = rgba(a.accent, 0.9);
    ctx.fillRect(-L / 2, -H / 2 - 22, L, 2);
    ctx.fillStyle = fw ? mixWhite(GOLD, flashK) : GOLD;
    ctx.fillRect(-L / 2, H / 2 + 8, L, 2);
    ctx.fillStyle = rgba(a.accent, 0.85);
    ctx.fillRect(-L / 2, H / 2 + 13, L, 5);
    // 착지 순간 띠 가장자리 섬광
    if (landK > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${(0.8 * landK).toFixed(3)})`;
      ctx.fillRect(-L / 2, -H / 2 - 2, L, 3); ctx.fillRect(-L / 2, H / 2 - 1, L, 3);
      ctx.globalCompositeOperation = 'source-over';
    }
    // ── 이름표 (영웅 이름, 금색) ──
    if (t >= T.img) {
      const k = clamp((t - T.img) / 0.15, 0, 1);
      ctx.globalAlpha = k;
      ctx.font = `700 15px ${FONT.title}`; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      const nm = CHARACTERS[this.charId]?.eng ?? '';
      const nx = -vw / 2 + vw * 0.05, ny = -H / 2 + 24;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.strokeText(nm, nx, ny);
      ctx.fillStyle = GOLD; ctx.fillText(nm, nx, ny);
      ctx.fillStyle = rgba(a.color, 0.8); ctx.fillRect(nx, ny + 6, Math.min(vw * 0.3, 22 + nm.length * 9) * k, 2);
      ctx.globalAlpha = 1;
    }
    // ── 시그니처 대사 + 낙관 ──
    this.drawText(ctx, t);
    // 먹물 방울
    for (const k of this.ink) {
      ctx.globalAlpha = clamp(1 - k.t / k.life, 0, 1);
      ctx.fillStyle = k.c; ctx.beginPath(); ctx.arc(k.x, k.y, k.r * (1 - 0.4 * k.t / k.life), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // ── 눈빛 (0.2초) ──
    if (eyeX !== null && t >= T.glint && t < T.glint + 0.22) {
      const sp = sprites();
      if (sp) {
        const k = (t - T.glint) / 0.2, s = Math.sin(clamp(k, 0, 1) * Math.PI) * 1.25;
        // 눈 위치는 회전하지 않은 화면 좌표 (띠 원점 기준) → 화면으로
        const ex = ox + eyeX, ey = oy + eyeY;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(ex, ey); ctx.rotate(k * 0.5);
        ctx.globalAlpha = 1;
        ctx.drawImage(sp.flare, -80 * s, -80 * s, 160 * s, 160 * s);
        ctx.globalAlpha = 0.6; ctx.rotate(Math.PI / 4);
        ctx.drawImage(sp.flare, -44 * s, -44 * s, 88 * s, 88 * s);
        ctx.restore();
      }
    }
  }

  /** 한 글자씩 1.8 → 1 배로 찍고, 다 찍힌 줄은 통째로 한 번에 그린다 (띠 좌표) */
  drawText(ctx, t) {
    const lay = this.lay, T = this.T;
    if (!lay) return;
    for (const r of lay.rows) {
      if (!r) continue;
      const L = r.L, S = L.S;
      const dx = r.x, dy = r.y - L.asc;
      if (T.short) {
        if (t < T.text0) continue;
        const k = ease.outCubic(clamp((t - T.text0) / 0.12, 0, 1)), s = 1.15 - 0.15 * k;
        ctx.globalAlpha = k;
        ctx.drawImage(L.c, dx + L.w * (1 - s) / 2, dy + L.h * (1 - s) / 2, L.w * s, L.h * s);
        ctx.globalAlpha = 1;
        continue;
      }
      const nG = L.glyphs.length;
      const allDone = t >= r.t0 + (nG - 1) * r.dt + GLYPH_T;
      if (allDone) { ctx.drawImage(L.c, dx, dy, L.w, L.h); continue; }
      for (let j = 0; j < nG; j++) {
        const tg = r.t0 + j * r.dt;
        if (t < tg) break;
        const gi = L.glyphs[j];
        const k = clamp((t - tg) / GLYPH_T, 0, 1), e = ease.outCubic(k);
        const s = 1.8 - 0.8 * e;
        // 공백 앞뒤를 포함한 조각 (공백 조각은 따로 찍지 않으므로 앞 글자 조각이 공백까지 덮는다)
        const x0 = L.cuts[gi], x1 = L.cuts[nextCut(L, gi)];
        const sw = x1 - x0;
        const cx = dx + x0 + sw / 2, cy = dy + L.h / 2;
        ctx.globalAlpha = e;
        ctx.drawImage(L.c, x0 * S, 0, sw * S, L.h * S, cx - sw * s / 2, cy - L.h * s / 2, sw * s, L.h * s);
      }
      ctx.globalAlpha = 1;
    }
    // 낙관
    const tx = this.text;
    if (tx?.seal && t >= lay.sealT) {
      const k = clamp((t - lay.sealT) / 0.1, 0, 1), s = 1.7 - 0.7 * ease.outBack(k);
      const sz = 54 / 72;
      ctx.save();
      ctx.translate(lay.sealX, lay.sealY); ctx.rotate(-8 * DEG); ctx.scale(s * sz, s * sz);
      ctx.globalAlpha = clamp(k * 1.5, 0, 1);
      ctx.drawImage(tx.seal.c, -36, -36, 72, 72);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  drawTitle(ctx, vw, vh, t) {
    const tt = this.text?.title;
    if (!tt) return;
    const T = this.T;
    const k = clamp((t - T.exit) / 0.12, 0, 1);
    const s = 2.3 - 1.3 * ease.outCubic(k);
    const dw = tt.w * s, dh = tt.h * s;
    let x = vw / 2 - dw / 2, y = vh * 0.28 - tt.base * s;
    if (this.shakeT > 0) { const a = this.shakeA * (this.shakeT / 0.14) * 0.6; x += rand(-a, a); y += rand(-a, a); }
    ctx.globalAlpha = clamp(k * 1.6, 0, 1);
    ctx.drawImage(tt.c, x, y, dw, dh);
    // 쾅 찍히는 순간 흰 잔상
    if (k < 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - k) * 0.5; ctx.drawImage(tt.c, x - dw * 0.05, y - dh * 0.05, dw * 1.1, dh * 1.1); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
  }
}

/** 공백은 앞 글자 조각에 붙인다 → 다음으로 찍히는(공백이 아닌) 글자의 경계 */
function nextCut(L, gi) {
  let j = gi + 1;
  while (j < L.cuts.length - 1 && !L.str[j]?.trim?.()) j++;
  return Math.min(j, L.cuts.length - 1);
}
function mixWhite(hex, k) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (c) => Math.round(c + (255 - c) * clamp(k, 0, 1));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
