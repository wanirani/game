// 「먹과 달빛」 재질: 그을린 반투명 유리 원판 · 달빛 테 · 붓 고리. 전부 Canvas 2D (흐림 효과 없음 — 배경을 흐리지 않는다).
// 게임에서는: 원판(종류×상태)과 아이콘은 미리 구운 스프라이트, 재사용 대기 호 · 충전 호 · 숫자만 매 프레임 그린다.
import { iconCanvas, ensoSprite, strokeSprite, smokeSprite, splatSprite, INK, CRIM, GOLD } from './ink.js';

export const DPR = Math.min(3, window.devicePixelRatio || 1);
const smoke = smokeSprite(256, 4);
const ENSO = { ink: ensoSprite(420, { w: 5.2, seed: 3 }), crim: ensoSprite(420, { w: 6, c: CRIM, seed: 8 }), gold: ensoSprite(420, { w: 4.6, c: GOLD, seed: 5 }), thin: ensoSprite(420, { w: 3.2, seed: 12, dry: 0.9, a0: 150, a1: 420 }) };
const TAU = Math.PI * 2;
// 검토(ui2review)에서 더함: ?glass=clear — 유리를 더 맑게 한 판(가운데 30 % → 가장자리 66 %). 기본값(48 → 78 %)은 그대로.
const GL = /[?&]glass=clear/.test(location.search) ? [0.30, 0.42, 0.66] : [0.48, 0.60, 0.78];

// 원판 한 장. o: s 지름(CSS px) · kind main|skill|aux|ult|sys|map · icon · 상태(pr 눌림 · on 켜짐 · off 잠김 · rdy 강조 · cool 남은 비율 0–1 · chg 충전 0–100 · ct 글자)
export function paintButton(cv, o) {
  const s = o.s, pad = Math.round(s * 0.2), full = s + pad * 2;
  cv.width = cv.height = Math.round(full * DPR); cv.style.width = cv.style.height = full + 'px'; cv.style.margin = -pad + 'px'; cv.dataset.pad = pad;
  const x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); x.clearRect(0, 0, full, full);
  const c = full / 2, R = s / 2 - 1, kind = o.kind || 'skill', big = kind === 'main', ultReady = kind === 'ult' && (o.chg ?? 0) >= 100;
  // 1) 바깥 그림자 (밝은 배경 위에서 원판을 띄운다)
  let g = x.createRadialGradient(c, c + 1, R * 0.86, c, c + 1, R + pad * 0.85); g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.beginPath(); x.arc(c, c, R + pad, 0, TAU); x.fill();
  if (o.rdy || ultReady || o.on) { const col = ultReady || o.on ? '232,40,63' : '232,197,108'; g = x.createRadialGradient(c, c, R * 0.9, c, c, R + pad); g.addColorStop(0, `rgba(${col},.55)`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.beginPath(); x.arc(c, c, R + pad, 0, TAU); x.fill(); }
  // 2) 그을린 유리: 가운데는 비치고 가장자리로 갈수록 두껍다
  x.save(); x.beginPath(); x.arc(c, c, R, 0, TAU); x.clip();
  x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; x.fillRect(0, 0, full, full); x.globalCompositeOperation = 'source-over';
  const k = kind === 'map' ? 1.05 : 1, tint = big ? '34,10,16' : (o.on || ultReady) ? '58,8,18' : '14,14,20';
  g = x.createRadialGradient(c, c - R * 0.18, R * 0.1, c, c, R); g.addColorStop(0, `rgba(${tint},${GL[0] * k})`); g.addColorStop(0.72, `rgba(8,8,12,${GL[1] * k})`); g.addColorStop(1, `rgba(2,2,5,${GL[2] * k})`);
  x.fillStyle = g; x.fillRect(0, 0, full, full);
  x.globalAlpha = 0.13; x.globalCompositeOperation = 'lighter'; x.drawImage(smoke, c - R, c - R, R * 2, R * 2); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  g = x.createLinearGradient(0, c - R, 0, c); g.addColorStop(0, 'rgba(236,240,255,.20)'); g.addColorStop(1, 'rgba(236,240,255,0)');   // 위쪽 달빛 반사
  x.fillStyle = g; x.beginPath(); x.ellipse(c, c - R * 0.62, R * 0.9, R * 0.5, 0, 0, TAU); x.fill();
  g = x.createRadialGradient(c, c + R * 1.05, 0, c, c + R * 1.05, R * 1.1); g.addColorStop(0, o.rdy ? 'rgba(232,197,108,.30)' : 'rgba(232,40,63,.24)'); g.addColorStop(1, 'rgba(232,40,63,0)');   // 아래쪽 붉은 달 반사
  x.fillStyle = g; x.fillRect(0, 0, full, full);
  if (o.pr) { g = x.createRadialGradient(c, c, 0, c, c, R); g.addColorStop(0, 'rgba(255,255,255,.50)'); g.addColorStop(0.7, 'rgba(236,240,255,.22)'); g.addColorStop(1, 'rgba(232,40,63,.45)'); x.fillStyle = g; x.fillRect(0, 0, full, full); }
  x.restore();
  // 3) 테: 달빛(왼쪽 위) → 은 → 핏빛(오른쪽 아래) 한 줄 + 안쪽 금빛 실선과 시계 눈금
  g = x.createLinearGradient(c - R, c - R, c + R, c + R); g.addColorStop(0, 'rgba(255,255,255,.98)'); g.addColorStop(0.5, 'rgba(206,212,230,.62)'); g.addColorStop(1, o.rdy ? 'rgba(232,197,108,.95)' : 'rgba(232,40,63,.72)');
  x.strokeStyle = o.rdy ? GOLD : ultReady || o.on ? '#ff5a6e' : g; x.lineWidth = big ? 1.6 : kind === 'sys' ? 1 : 1.25; x.beginPath(); x.arc(c, c, R - 0.5, 0, TAU); x.stroke();
  if (s >= 50) {
    x.strokeStyle = 'rgba(232,197,108,.42)'; x.lineWidth = 0.75; x.beginPath(); x.arc(c, c, R - 4, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(232,197,108,.6)'; x.lineWidth = 0.9; x.beginPath(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, l = i % 3 === 0 ? 3.4 : 1.8; x.moveTo(c + Math.cos(a) * (R - 4.4), c + Math.sin(a) * (R - 4.4)); x.lineTo(c + Math.cos(a) * (R - 4.4 - l), c + Math.sin(a) * (R - 4.4 - l)); } x.stroke();
  }
  // 4) 붓 고리 (공격은 굵게, 기술은 가늘게, 궁극기는 핏빛)
  const en = big ? ENSO.ink : kind === 'ult' ? (ultReady ? ENSO.crim : null) : kind === 'skill' ? ENSO.thin : kind === 'map' ? ENSO.ink : null;
  if (en) { const d = (R + (big ? 5.5 : kind === 'map' ? 3.5 : 4)) * 2 / 0.88; x.globalAlpha = o.off ? 0.3 : big || kind === 'map' ? 0.95 : ultReady ? 1 : 0.6; x.drawImage(en, c - d / 2, c - d / 2, d, d); x.globalAlpha = 1; }
  if (o.pr) { const d = (R + pad * 0.72) * 2 / 0.88; x.save(); x.translate(c, c); x.rotate(2.2); x.globalAlpha = 0.8; x.drawImage(ENSO.thin, -d / 2, -d / 2, d, d); x.restore(); }
  // 5) 그림
  if (o.icon) {
    const d = s * (big ? 0.7 : kind === 'sys' ? 0.62 : kind === 'ult' ? 0.74 : 0.68), dim = o.off ? 0.3 : o.cool > 0 ? 0.34 : 1;
    x.save(); x.globalAlpha = dim; x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 3 * DPR; x.shadowOffsetY = 1 * DPR;
    x.drawImage(iconCanvas(o.icon, 256), c - d / 2, c - d / 2, d, d); x.shadowBlur = 1.5 * DPR; x.shadowOffsetY = 0; x.drawImage(iconCanvas(o.icon, 256), c - d / 2, c - d / 2, d, d); x.restore();
  }
  // 6) 재사용 대기: 남은 만큼 어둡게 덮고, 테가 시계 방향으로 차오른다
  if (o.cool > 0) {
    const a0 = -Math.PI / 2, a1 = a0 + (1 - o.cool) * TAU;
    x.fillStyle = 'rgba(2,2,5,.46)'; x.beginPath(); x.moveTo(c, c); x.arc(c, c, R - 1, a1, a0 + TAU); x.closePath(); x.fill();
    x.lineCap = 'round'; x.strokeStyle = INK; x.shadowColor = 'rgba(236,240,255,.9)'; x.shadowBlur = 5 * DPR; x.lineWidth = 2.6; x.beginPath(); x.arc(c, c, R - 0.5, a0, a1); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(c + Math.cos(a1) * (R - 0.5), c + Math.sin(a1) * (R - 0.5), 2.4, 0, TAU); x.fill(); x.shadowBlur = 0; x.shadowColor = 'transparent';
  }
  // 7) 궁극기 충전: 바깥 고리가 핏빛으로 찬다
  if (kind === 'ult' && !ultReady) {
    const a0 = -Math.PI / 2, a1 = a0 + (o.chg ?? 0) / 100 * TAU; x.lineCap = 'round';
    x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 3; x.beginPath(); x.arc(c, c, R + 3.5, 0, TAU); x.stroke();
    x.strokeStyle = CRIM; x.shadowColor = 'rgba(232,40,63,.9)'; x.shadowBlur = 5 * DPR; x.lineWidth = 3; x.beginPath(); x.arc(c, c, R + 3.5, a0, a1); x.stroke(); x.shadowBlur = 0; x.shadowColor = 'transparent';
  }
  // 8) 글자 (대기 초 · 충전 %)
  if (o.ct) {
    const pct = /%/.test(o.ct), fs = pct ? Math.max(10, s * 0.19) : s * 0.44;
    x.font = `800 ${fs}px "BN Num", "Hahmlet", serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    const ty = pct ? c + R * 0.62 : c + 1; x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 3; x.strokeText(o.ct, c, ty); x.fillStyle = pct ? '#ff8b98' : '#fff'; x.fillText(o.ct, c, ty);
  }
  // 9) 잠김: 작은 자물쇠 봉인
  if (o.off) { const r2 = Math.max(8, s * 0.19), bx = c + R * 0.66, by = c + R * 0.66; x.fillStyle = 'rgba(8,8,12,.9)'; x.beginPath(); x.arc(bx, by, r2, 0, TAU); x.fill(); x.strokeStyle = 'rgba(232,40,63,.9)'; x.lineWidth = 1; x.stroke(); x.drawImage(iconCanvas('padlock', 96), bx - r2 * 0.72, by - r2 * 0.76, r2 * 1.44, r2 * 1.44); }
}

// 스틱: 거의 비치는 큰 원판 + 마른 붓 고리 + 네 방향 붓 점, 손잡이는 달빛 구슬
export function paintStick(cv, s, o = {}) {
  cv.width = cv.height = Math.round(s * DPR); cv.style.width = cv.style.height = s + 'px';
  const x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); const c = s / 2, R = s / 2 - 6;
  let g = x.createRadialGradient(c, c, R * 0.3, c, c, R); g.addColorStop(0, 'rgba(10,10,14,.10)'); g.addColorStop(0.8, 'rgba(8,8,12,.26)'); g.addColorStop(1, 'rgba(2,2,5,.46)');
  x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, TAU); x.fill();
  g = x.createLinearGradient(c - R, c - R, c + R, c + R); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(206,212,230,.4)'); g.addColorStop(1, 'rgba(232,40,63,.6)');
  x.strokeStyle = g; x.lineWidth = 1.1; x.beginPath(); x.arc(c, c, R - 0.5, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(232,197,108,.4)'; x.lineWidth = 0.75; x.beginPath(); x.arc(c, c, R - 5, 0, TAU); x.stroke();
  const d = (R + 3) * 2 / 0.88; x.globalAlpha = 0.8; x.drawImage(ENSO.thin, c - d / 2, c - d / 2, d, d); x.globalAlpha = 1;
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 - Math.PI / 2, tx = c + Math.cos(a) * (R - 15), ty = c + Math.sin(a) * (R - 15); x.save(); x.translate(tx, ty); x.rotate(a - Math.PI / 2); x.globalAlpha = 0.85; x.drawImage(iconCanvas('next', 96), -8, -8, 16, 16); x.restore(); }
}
export function paintKnob(cv, s) {
  const pad = 8, full = s + pad * 2; cv.width = cv.height = Math.round(full * DPR); cv.style.width = cv.style.height = full + 'px';
  const x = cv.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); const c = full / 2, R = s / 2;
  let g = x.createRadialGradient(c, c + 2, R * 0.8, c, c + 2, R + pad); g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(c, c, R + pad, 0, TAU); x.fill();
  g = x.createRadialGradient(c - R * 0.3, c - R * 0.38, R * 0.05, c, c, R); g.addColorStop(0, 'rgba(255,255,255,.78)'); g.addColorStop(0.45, 'rgba(214,220,236,.46)'); g.addColorStop(1, 'rgba(120,126,150,.34)');
  x.fillStyle = g; x.beginPath(); x.arc(c, c, R, 0, TAU); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 1.2; x.beginPath(); x.arc(c, c, R - 0.5, 0, TAU); x.stroke();
  x.strokeStyle = 'rgba(232,197,108,.7)'; x.lineWidth = 0.75; x.beginPath(); x.arc(c, c, R - 4, 0, TAU); x.stroke();
  const d = s * 0.5; x.globalAlpha = 0.9; x.globalCompositeOperation = 'source-over'; x.drawImage(iconCanvas('moon', 128), c - d / 2, c - d / 2, d, d);
}

// CSS 에서 쓰는 붓 자국 그림들 (게임에서는 같은 것을 아틀라스에 구워 둔다)
export function installSprites() {
  const R = document.documentElement.style, url = (cv) => `url(${cv.toDataURL('image/png')})`;
  R.setProperty('--st-crim', url(strokeSprite(640, 44, { c: CRIM, seed: 21 })));
  R.setProperty('--st-ink', url(strokeSprite(640, 44, { c: INK, seed: 21 })));
  R.setProperty('--st-tip', url(strokeSprite(120, 44, { c: INK, seed: 27, dry: 0.97, ds: 0.05, w: 17, p: () => 1 })));
  R.setProperty('--st-gold', url(strokeSprite(520, 36, { c: GOLD, seed: 33, w: 13 })));
  R.setProperty('--st-dark', url(strokeSprite(640, 44, { c: '#050508', seed: 21, dry: 0.25, w: 17 })));
  R.setProperty('--st-wash', url(strokeSprite(560, 120, { c: '#050508', seed: 41, dry: 0.5, w: 19, ds: 0.6 })));
  R.setProperty('--st-plate', url(strokeSprite(480, 110, { c: CRIM, seed: 52, dry: 0.6, w: 18, ds: 0.6, sp: 5 })));
  R.setProperty('--st-under', url(strokeSprite(360, 22, { c: CRIM, seed: 61, dry: 0.8, w: 11, ds: 0.3 })));
  R.setProperty('--st-line', url(strokeSprite(720, 16, { c: INK, seed: 71, dry: 0.85, w: 7, ds: 0.2 })));
  for (const [n, c] of [['r2', '#86d6a4'], ['r3', '#86b6ff'], ['r4', '#c9a0ff']]) R.setProperty('--st-' + n, url(strokeSprite(160, 22, { c, seed: 81, dry: 0.6, w: 13 })));
  R.setProperty('--enso', url(ENSO.ink)); R.setProperty('--enso-gold', url(ENSO.gold)); R.setProperty('--enso-crim', url(ENSO.crim)); R.setProperty('--enso-thin', url(ENSO.thin));
  R.setProperty('--splat', url(splatSprite(240, '#060609', 9))); R.setProperty('--splat-crim', url(splatSprite(240, CRIM, 14)));
  R.setProperty('--smoke', url(smokeSprite(512, 7)));
}
const urls = new Map();
export const icURL = (k) => { if (!urls.has(k)) urls.set(k, iconCanvas(k, 160).toDataURL('image/png')); return urls.get(k); };
export const ic = (k, cls = 'ic') => `<img class="${cls}" src="${icURL(k)}" alt="" draggable="false">`;
export const fontsReady = () => Promise.all(['800 20px "BN Num"', '400 20px "BN Dmg"', '400 20px "BN Brush"', '400 20px "BN Seal"', '700 20px "Hahmlet"', '500 20px "Noto Sans KR"'].map((f) => document.fonts.load(f, '카엘 狩 0123'))).then(() => document.fonts.ready);
