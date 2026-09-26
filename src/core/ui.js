// UI 그리기 도우미: 고딕풍 패널, 테두리, 외곽선 텍스트, 피 글씨(bloodText), 버튼(터치/클릭), 목록 메뉴, 게이지, 줄바꿈
import { input } from './input.js';
import { clamp, rgba } from './math.js';

/**
 * 글꼴 묶음. 모든 글꼴은 assets/fonts/ 에 woff2 로 들어 있다 (오프라인·APK 대응, css/style.css 의 @font-face).
 * 한글 글꼴은 게임에 쓰인 글자(기본 파일) + KS X 1001 한글 2350자의 나머지("… Ext", 필요할 때만 받음)로 서브셋.
 * 새 대사를 많이 넣었으면 python3 tools/fonts/build_fonts.py 로 다시 만든다. 새 묶음을 만들 때도 Ext 이름을 기본 글꼴 바로 뒤에 둔다.
 *  - blood : 큰 제목·보스 이름·STAGE CLEAR 같은 피 글씨 (라틴: Grenze Gotisch 블랙레터 / 한글: Hahmlet 블랙)
 *  - logo  : 영문 장식 제목 (블랙레터, 굵게 900)
 *  - title : 고딕 세리프 소제목·이름 (Hahmlet, 700~900)
 *  - body  : 작은 글씨·대화·설명 (Noto Sans KR, 가독성 우선)
 *  - num   : 숫자·점수·데미지 (Cinzel, 한글은 본문 글꼴로)
 */
export const FONT = {
  body: '"Noto Sans KR", "Noto Sans KR Ext", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  title: '"Hahmlet", "Hahmlet Ext", serif',
  logo: '"Grenze Gotisch", "Hahmlet", "Hahmlet Ext", serif',
  blood: '"Grenze Gotisch", "Hahmlet", "Hahmlet Ext", serif',
  num: '"Cinzel", "Noto Sans KR", "Noto Sans KR Ext", sans-serif',
};

export const COLORS = {
  gold: '#e8c872', goldDark: '#8a6a2a', blood: '#b3122e', bloodDark: '#4a0612',
  bone: '#efe4cf', ink: '#0b0710', panel: 'rgba(14,8,18,0.88)', panelEdge: '#6e5530',
  text: '#efe4cf', dim: '#9d8f80', good: '#7ee07e', bad: '#ff6060', mp: '#5aa8ff', hp: '#e8283c',
  rarity: ['#d8d0c0', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'],
};
export const RARITY_NAMES = ['일반', '고급', '희귀', '영웅', '전설', '신화'];

export function font(size, weight = 500, family = FONT.body) {
  return `${weight} ${size}px ${family}`;
}

/** 외곽선 텍스트 */
export function text(ctx, str, x, y, { size = 16, color = COLORS.text, align = 'left', weight = 500, family = FONT.body, outline = 'rgba(0,0,0,0.85)', ow = 3, baseline = 'alphabetic', shadow = false, maxWidth } = {}) {
  ctx.font = font(size, weight, family);
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(str, x + 2, y + 2, maxWidth); }
  if (outline && ow > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = ow; ctx.strokeStyle = outline; ctx.strokeText(str, x, y, maxWidth); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y, maxWidth);
  ctx.textBaseline = 'alphabetic';
}

/** 자동 줄바꿈 (한글 대응: 글자 단위, 공백 우선). 줄 배열 반환 */
export function wrap(ctx, str, maxW, size = 16, weight = 500, family = FONT.body) {
  ctx.font = font(size, weight, family);
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    const words = para.split(/(\s+)/);
    for (const w of words) {
      const test = line + w;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = w.trimStart();
      // 한 단어가 너무 길면 글자 단위로 자름
      while (ctx.measureText(line).width > maxW) {
        let k = line.length;
        while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}
/** 여러 줄 문단. 밝은 배경(양피지 등)에서는 outline:null 또는 ow:0 으로 외곽선을 끈다 */
export function paragraph(ctx, str, x, y, maxW, { size = 16, lineH = 1.55, color = COLORS.text, weight = 500, family = FONT.body, align = 'left', maxLines = 99, outline = 'rgba(0,0,0,0.85)', ow = 2 } = {}) {
  const lines = wrap(ctx, str, maxW, size, weight, family).slice(0, maxLines);
  lines.forEach((l, i) => text(ctx, l, x, y + i * size * lineH, { size, color, weight, family, align, outline, ow }));
  return lines.length * size * lineH;
}

/** 고딕 장식 패널 */
export function panel(ctx, x, y, w, h, { fill = COLORS.panel, edge = COLORS.panelEdge, glow = null, corner = true, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, fill); g.addColorStop(1, 'rgba(6,2,8,0.94)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  ctx.strokeStyle = edge; ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = rgba('#e8c872', 0.18); ctx.lineWidth = 1;
  ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  if (corner) {
    ctx.fillStyle = COLORS.gold;
    for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** 가로 게이지 */
export function bar(ctx, x, y, w, h, ratio, { color = COLORS.hp, back = 'rgba(0,0,0,0.6)', ghost = null, edge = '#2a1a10', shine = true } = {}) {
  ratio = clamp(ratio, 0, 1);
  ctx.fillStyle = back; ctx.fillRect(x, y, w, h);
  if (ghost !== null && ghost > ratio) { ctx.fillStyle = 'rgba(255,240,200,0.55)'; ctx.fillRect(x, y, w * clamp(ghost, 0, 1), h); }
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, color); g.addColorStop(1, rgba('#000000', 0.35));
  ctx.fillStyle = color; ctx.fillRect(x, y, w * ratio, h);
  if (shine) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w * ratio, Math.max(1, h * 0.35)); }
  ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/** 포인터가 사각형 안에 있고 이번 프레임에 탭했는지 */
export function tapped(r) {
  const p = input.pointer;
  return p.tapped && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}
export function hovered(r) {
  const p = input.pointer;
  return p.active && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** 버튼 그리기 + 탭 판정. 반환: 탭되었으면 true */
export function button(ctx, r, label, { selected = false, disabled = false, size = 18, color, sub } = {}) {
  const hot = selected || hovered(r);
  ctx.save();
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, hot ? 'rgba(120,20,36,0.95)' : 'rgba(30,14,30,0.9)');
  g.addColorStop(1, hot ? 'rgba(60,6,16,0.95)' : 'rgba(10,4,12,0.92)');
  ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = hot ? COLORS.gold : COLORS.panelEdge; ctx.lineWidth = hot ? 2 : 1.5;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (hot) { ctx.fillStyle = COLORS.gold; ctx.beginPath(); ctx.moveTo(r.x + 8, r.y + r.h / 2 - 5); ctx.lineTo(r.x + 14, r.y + r.h / 2); ctx.lineTo(r.x + 8, r.y + r.h / 2 + 5); ctx.fill(); }
  text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + (sub ? -3 : size * 0.36), { size, align: 'center', color: disabled ? '#6a6060' : color || (hot ? '#fff4d8' : COLORS.text), weight: 700 });
  if (sub) text(ctx, sub, r.x + r.w / 2, r.y + r.h / 2 + 15, { size: 11, align: 'center', color: COLORS.dim });
  ctx.restore();
  return !disabled && tapped(r);
}

/**
 * 키보드/패드/터치 공용 목록 메뉴 상태.
 * const m = new ListMenu(items.length, {cols:1, wrap:true});
 * m.update() → 'confirm' | 'cancel' | null ; m.index
 * 터치는 m.hit(i, rect) 로 각 항목 영역 등록.
 *  - 마우스 클릭: 바로 선택+확정
 *  - 터치: 선택되지 않은 항목을 처음 탭하면 선택만(moved=true, 미리보기), 선택된 항목을 다시 탭하면 확정
 */
export class ListMenu {
  constructor(count, { cols = 1, wrap = true, index = 0 } = {}) {
    this.count = count; this.cols = cols; this.wrap = wrap; this.index = index;
    this.rects = []; this.repeat = 0; this.moved = false;
  }
  setCount(n) { this.count = n; this.index = clamp(this.index, 0, Math.max(0, n - 1)); }
  update(dt = 1 / 60) {
    this.moved = false;
    if (this.count <= 0) {
      if (input.pressed('cancel') || input.pressed('menu')) return 'cancel';
      return null;
    }
    const step = (d) => {
      let i = this.index + d;
      if (this.wrap) i = (i + this.count) % this.count; else i = clamp(i, 0, this.count - 1);
      if (i !== this.index) { this.index = i; this.moved = true; }
    };
    const dirs = [['up', -this.cols], ['down', this.cols], ['left', -1], ['right', 1]];
    for (const [a, d] of dirs) {
      if (this.cols === 1 && (a === 'left' || a === 'right')) continue;
      if (input.pressed(a)) { step(d); this.repeat = 0.32; }
      else if (input.down(a)) { this.repeat -= dt; if (this.repeat <= 0) { step(d); this.repeat = 0.08; } }
    }
    // 터치/클릭
    if (input.pointer.tapped) {
      for (let i = 0; i < this.rects.length; i++) {
        const r = this.rects[i];
        if (r && tappedRect(r)) {
          if (this.index === i || !input.touchMode) { this.index = i; return 'confirm'; }
          this.index = i; this.moved = true; return null;
        }
      }
    }
    if (input.pressed('confirm')) return 'confirm';
    if (input.pressed('cancel')) return 'cancel';
    return null;
  }
  hit(i, rect) { this.rects[i] = rect; }
  clearHits() { this.rects.length = 0; }
}
function tappedRect(r) {
  const p = input.pointer;
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** 화면 비네팅 */
export function vignette(ctx, w, h, strength = 0.65, color = '0,0,0') {
  const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.95);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(1, `rgba(${color},${strength})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

/** 배경 이미지를 cover 방식으로 그리기 (없으면 그라데이션) */
export function drawCover(ctx, img, w, h, { ox = 0.5, oy = 0.5, fallback = ['#140814', '#05020a'], alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha = alpha;
  if (img) {
    const s = Math.max(w / img.width, h / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.drawImage(img, (w - dw) * ox, (h - dh) * oy, dw, dh);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, fallback[0]); g.addColorStop(1, fallback[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

/** 뒤로가기/닫기 등 모바일용 코너 버튼 */
export function cornerButton(ctx, x, y, label) {
  const r = { x, y, w: 64, h: 34 };
  return button(ctx, r, label, { size: 14 });
}

/** 키 안내 텍스트 (터치 모드면 다르게) */
export function hint(ctx, w, h, keysText, touchText) {
  text(ctx, input.touchMode ? (touchText ?? keysText) : keysText, w / 2, h - 12, { size: 13, align: 'center', color: COLORS.dim, ow: 2 });
}

// ───────────────────────── 글꼴 로딩 ─────────────────────────
/**
 * 첫 화면 전에 받아 둘 글꼴 (css/style.css 의 @font-face 와 짝). 가변 굵기 파일이라 글꼴마다 하나씩이면 된다.
 * "Nanum Myeongjo" 는 예전 코드(타이틀 로고 부제)가 부르는 이름으로, Hahmlet 파일을 가리킨다. "… Ext" 확장 한글은 필요할 때만 받는다.
 */
export const FONT_FACES = [
  '700 16px "Noto Sans KR"', '800 16px "Hahmlet"', '800 16px "Nanum Myeongjo"',
  '900 16px "Grenze Gotisch"', '900 16px "Cinzel"', '900 16px "Cinzel Decorative"',
];
/**
 * 글꼴을 불러오고 최대 timeout(ms)까지만 기다린다. 실패·시간초과여도 게임은 시스템 글꼴로 계속된다.
 * 반환: 모두 불러왔으면 true
 */
export function loadFonts(timeout = 1800) {
  const fs = typeof document !== 'undefined' ? document.fonts : null;
  if (!fs?.load) return Promise.resolve(false);
  const sample = '블러드 녹턴 BLOOD 0123';
  const all = Promise.all(FONT_FACES.map((f) => fs.load(f, sample).then((r) => r.length > 0, () => false)))
    .then((r) => r.every(Boolean));
  return Promise.race([all, new Promise((r) => setTimeout(() => r(false), timeout))]);
}
/** 부팅 때 한 번 시작한 글꼴 로딩 (index.html 의 preload 로 이미 받는 중인 파일을 기다린다). 페이지 시작 후 약 2초가 넘으면 기다리지 않는다 */
export const fontsReady = loadFonts(typeof performance !== 'undefined' ? clamp(2100 - performance.now(), 300, 1800) : 0);
// 캔버스는 첫 그림 전에 글꼴이 있어야 제목 캐시 등이 시스템 글꼴로 굳지 않는다 → 이 모듈을 쓰는 모든 장면이 최대 약 1.8초 기다린다
await fontsReady;

// ───────────────────────── 피 글씨 ─────────────────────────
/**
 * 피 글씨 스타일. grad: 위→아래 채움, edge: 바깥 테두리, inner: 안쪽 어두운 테, hi: 젖은 윗면 광택,
 * glow: 뒤쪽 발광, bevel: 금박 양각(왼쪽 위 밝게·오른쪽 아래 어둡게), drips: 기본 피 방울 양(0~1), drip: 방울 색 [어두움, 중간, 밝음, 반사광]
 */
export const TEXT_STYLES = {
  blood: {
    grad: [[0, '#ff6a5e'], [0.22, '#e0242e'], [0.55, '#a00a1e'], [0.85, '#5e0412'], [1, '#34000a']],
    edge: '#120003', inner: 'rgba(38,0,6,0.7)', hi: 'rgba(255,170,160,0.26)', glow: 'rgba(210,10,34,0.55)',
    drips: 1, drip: ['#2a0006', '#8e0a1e', '#e8343c', '#ff9a90'],
  },
  gold: {
    grad: [[0, '#fff8e0'], [0.3, '#f4d68c'], [0.58, '#c8963a'], [0.82, '#8a5018'], [1, '#5a2c0a']],
    edge: '#1a0802', inner: 'rgba(70,34,4,0.75)', hi: 'rgba(255,255,244,0.85)', lo: 'rgba(60,20,0,0.75)', glow: 'rgba(200,16,40,0.6)',
    bevel: true, drips: 0, drip: ['#2a0006', '#8e0a1e', '#e8343c', '#ff9a90'],
  },
  bone: {
    grad: [[0, '#fffaf0'], [0.4, '#e8dcc4'], [0.8, '#a8967a'], [1, '#6a5a44']],
    edge: '#0e0806', inner: 'rgba(40,28,20,0.7)', hi: 'rgba(255,255,255,0.8)', lo: 'rgba(30,18,10,0.6)', glow: 'rgba(0,0,0,0.7)',
    bevel: true, drips: 0, drip: ['#2a0006', '#8e0a1e', '#e8343c', '#ff9a90'],
  },
};

const TXT_CACHE = new Map();
const TXT_CACHE_MAX = 48;
const SCRATCH = []; // 작업용 캔버스 0: 읽기용(방울 자리 분석), 1: 글자 몸통, 2: 광택, 3: 저해상도 발광, 4: 글자 마스크, 5: 테두리 포함 마스크, 6: 글자 폭 재기
function mkCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function scratch(which, w, h) {
  let c = SCRATCH[which];
  if (!c) c = SCRATCH[which] = mkCanvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: which === 0 });
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } // 크기를 정확히 맞춰야 합성 연산이 필요한 영역만 건드린다 (크기 변경은 초기화도 겸한다)
  else g.clearRect(0, 0, w, h);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  return [c, g];
}
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function setSpacing(g, px) { try { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; } catch { /* 미지원 */ } }

// 피 방울 스프라이트 (스타일 색별로 한 번만 만든다)
const DRIP_SPR = new Map();
function dripSprites(cols) {
  const key = cols.join();
  let s = DRIP_SPR.get(key);
  if (s) return s;
  const [dark, mid, bright, spec] = cols;
  // 줄기: 가로 단면(원통 음영 + 가는 반사선)을 세로로 늘려 그린다
  const stem = mkCanvas(48, 2), sg = stem.getContext('2d');
  const lg = sg.createLinearGradient(0, 0, 48, 0);
  lg.addColorStop(0, '#120003'); lg.addColorStop(0.1, dark); lg.addColorStop(0.26, mid); lg.addColorStop(0.36, bright);
  lg.addColorStop(0.42, spec); lg.addColorStop(0.48, bright); lg.addColorStop(0.64, mid); lg.addColorStop(0.9, dark); lg.addColorStop(1, '#120003');
  sg.fillStyle = lg; sg.fillRect(0, 0, 48, 2);
  // 끝 방울: 아래가 무거운 물방울 + 반사광
  const bulb = mkCanvas(64, 72), bg = bulb.getContext('2d');
  const drop = (g, r) => { g.beginPath(); g.moveTo(32, 36 - r * 1.25); g.bezierCurveTo(32 + r * 0.35, 36 - r * 0.7, 32 + r, 36 - r * 0.3, 32 + r, 36 + r * 0.25); g.arc(32, 36 + r * 0.25, r, 0, Math.PI); g.bezierCurveTo(32 - r, 36 - r * 0.3, 32 - r * 0.35, 36 - r * 0.7, 32, 36 - r * 1.25); g.fill(); };
  bg.fillStyle = '#120003'; drop(bg, 27);
  const rg = bg.createRadialGradient(25, 36, 2, 32, 40, 26);
  rg.addColorStop(0, bright); rg.addColorStop(0.45, mid); rg.addColorStop(1, dark);
  bg.fillStyle = rg; drop(bg, 24.5);
  bg.fillStyle = spec; bg.globalAlpha = 0.9; bg.beginPath(); bg.ellipse(24, 38, 4.5, 7, 0.25, 0, Math.PI * 2); bg.fill();
  bg.globalAlpha = 0.5; bg.beginPath(); bg.ellipse(40, 50, 2.5, 3, 0, 0, Math.PI * 2); bg.fill();
  s = { stem, bulb };
  DRIP_SPR.set(key, s);
  return s;
}

/** 글자 아랫면에서 피가 흘러내릴 자리 찾기 (문자열마다 결정적 → 깜빡이지 않는다) */
function findDrips(g, PW, PH, S, oy, size, amount, str, seed) {
  if (amount <= 0) return [];
  const data = g.getImageData(0, 0, PW, PH).data;
  const LW = Math.floor(PW / S);
  const bottom = new Float32Array(LW).fill(-1);
  for (let lx = 0; lx < LW; lx++) {
    const px = Math.min(PW - 1, Math.round((lx + 0.5) * S));
    for (let py = PH - 1; py >= 0; py--) {
      if (data[(py * PW + px) * 4 + 3] > 150) { bottom[lx] = py / S; break; }
    }
  }
  const run = (lx, ly) => { // 해당 줄에서 불투명한 가로 길이
    const py = Math.max(0, Math.min(PH - 1, Math.round(ly * S)));
    const at = (x) => x >= 0 && x < PW && data[(py * PW + x) * 4 + 3] > 150;
    const px = Math.round((lx + 0.5) * S);
    let a = px, b = px;
    while (at(a - 1)) a--;
    while (at(b + 1)) b++;
    return at(px) ? (b - a + 1) / S : 0;
  };
  const cand = [];
  for (let lx = 3; lx < LW - 3; lx++) {
    const b = bottom[lx];
    if (b < 0 || b < oy - size * 0.2) continue; // 기준선 근처 아랫면만
    if (bottom[lx - 3] > b + 0.8 || bottom[lx + 3] > b + 0.8) continue; // 옆이 더 낮으면 가장 낮은 곳이 아님
    const w = run(lx, b - 1.2);
    if (w < size * 0.045) continue;
    cand.push({ x: lx + 0.5, y: b, run: w });
  }
  const r = rng(seed);
  for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
  const glyphs = [...str].filter((ch) => ch.trim()).length;
  const want = clamp(Math.round(glyphs * 0.62 * amount + 0.4), 1, 18);
  const gap = Math.max(6, size * 0.32);
  const out = [];
  for (const c of cand) {
    if (out.length >= want) break;
    if (out.some((o) => Math.abs(o.x - c.x) < gap)) continue;
    const w = clamp(c.run * 0.8, size * 0.06, size * 0.13);
    const long = r();
    out.push({
      x: c.x, y: c.y - w * 0.3, w,
      len: size * (0.16 + long * long * 0.95) * (0.55 + amount * 0.45),
      period: 3.6 + r() * 5.2, phase: r(), falls: r() < 0.6,
      delay: r() * 0.9, grow: 1.1 + r() * 1.9,
    });
  }
  return out;
}

/** 캐시 비트맵 한 장 만들기 (글자 + 테두리 + 발광 + 광택 + 방울 뿌리) */
function buildText(str, size, weight, family, styleName, st, spacing, amount, S, glow) {
  const fontStr = `${weight} ${size}px ${family}`;
  const mg = (SCRATCH[6] ||= mkCanvas(1, 1)).getContext('2d'); // 재기 전용 (크기를 바꾸지 않는다)
  mg.font = fontStr; setSpacing(mg, spacing);
  const m = mg.measureText(str);
  const adv = m.width;
  const asc = m.actualBoundingBoxAscent ?? size * 0.8, desc = m.actualBoundingBoxDescent ?? size * 0.22;
  const left = m.actualBoundingBoxLeft ?? 0, right = m.actualBoundingBoxRight ?? adv;
  const fAsc = m.fontBoundingBoxAscent ?? size * 0.92, fDesc = m.fontBoundingBoxDescent ?? size * 0.24;
  const pad = Math.ceil(size * (glow ? 0.62 : 0.22) + 6);
  const W = Math.ceil(left + right + pad * 2), H = Math.ceil(asc + desc + pad * 2);
  const PW = Math.ceil(W * S), PH = Math.ceil(H * S);
  const ox = pad + left, oy = pad + asc;
  const seed = strHash(`${str}|${size}|${family}`);
  const prep = (g) => { g.setTransform(S, 0, 0, S, 0, 0); g.font = fontStr; setSpacing(g, spacing); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineCap = 'round'; };

  // 1) 마스크(논리 해상도) → 피 방울 자리
  let drips = [];
  if (amount > 0) {
    const [, ag] = scratch(0, W, H);
    ag.font = fontStr; setSpacing(ag, spacing); ag.textAlign = 'left'; ag.textBaseline = 'alphabetic';
    ag.fillStyle = '#000'; ag.fillText(str, ox, oy);
    drips = findDrips(ag, W, H, 1, oy, size, amount, str, seed);
  }
  const roots = drips.map((d) => { // 글자 아랫면에서 오목하게 좁아지며 방울 줄기로 이어지는 목
    const p = new Path2D(), w = d.w, x = d.x, y = d.y;
    p.moveTo(x - w * 1.25, y - w * 0.5);
    p.quadraticCurveTo(x - w * 0.5, y - w * 0.2, x - w * 0.5, y + w * 1.2);
    p.lineTo(x + w * 0.5, y + w * 1.2);
    p.quadraticCurveTo(x + w * 0.5, y - w * 0.2, x + w * 1.25, y - w * 0.5);
    p.closePath();
    return p;
  });
  const shape = (g, how) => {
    if (how === 'fill') { g.fillText(str, ox, oy); for (const p of roots) g.fill(p); }
    else { g.strokeText(str, ox, oy); for (const p of roots) g.stroke(p); }
  };

  // 글자 모양은 두 번만 래스터화하고(M: 채움, E: 테두리 포함), 나머지는 비트맵 합성으로 만든다 (큰 글자 fillText 는 비싸다)
  const edgeW = Math.max(2.5, size * 0.1);
  const blit = (g, src, dx = 0, dy = 0) => { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(src, 0, 0, PW, PH, dx * S, dy * S, PW, PH); g.restore(); };
  const [mc, mk] = scratch(4, PW, PH);
  prep(mk); mk.fillStyle = '#000'; shape(mk, 'fill');
  const [ec, ek] = scratch(5, PW, PH);
  prep(ek); ek.fillStyle = st.edge; ek.strokeStyle = st.edge; ek.lineWidth = edgeW; shape(ek, 'stroke'); shape(ek, 'fill');

  const out = mkCanvas(PW, PH), c = out.getContext('2d');
  prep(c);
  // 2) 발광(1/4 해상도로 흐려 늘림) + 그림자 + 바깥 테두리
  if (glow) {
    const gs = Math.max(0.25, S / 4), GW = Math.ceil(W * gs), GH = Math.ceil(H * gs);
    const [gc, gg] = scratch(3, GW, GH);
    gg.shadowColor = st.glow; gg.shadowBlur = size * 0.28 * gs;
    gg.drawImage(ec, 0, 0, PW, PH, 0, 0, W * gs, H * gs);
    gg.shadowColor = 'transparent'; gg.globalCompositeOperation = 'destination-out';
    gg.drawImage(mc, 0, 0, PW, PH, 0, 0, W * gs, H * gs);
    c.drawImage(gc, 0, 0, W * gs, H * gs, 0, 0, W, H);
  }
  c.save(); c.globalAlpha = 0.7; blit(c, ec, size * 0.03, size * 0.07); c.restore();
  blit(c, ec);

  // 3) 글자 몸통: 세로 그라데이션 + 얼룩 + 안쪽 어두운 테 + 젖은 광택
  const [fc, fg] = scratch(1, PW, PH);
  prep(fg);
  blit(fg, mc);
  fg.globalCompositeOperation = 'source-in';
  const gr = fg.createLinearGradient(0, oy - asc, 0, oy + Math.max(desc, size * 0.12));
  for (const [o, col] of st.grad) gr.addColorStop(o, col);
  fg.fillStyle = gr; fg.fillRect(0, 0, W, H);
  fg.globalCompositeOperation = 'source-atop';
  const r = rng(seed ^ 0x9e3779b9);
  const blots = Math.round((left + right) / size * 5);
  for (let i = 0; i < blots; i++) { // 굳은 핏자국 얼룩
    fg.fillStyle = r() < 0.7 ? 'rgba(30,0,6,0.22)' : 'rgba(255,150,130,0.12)';
    fg.beginPath(); fg.ellipse(ox - left + r() * (left + right), oy - asc + r() * (asc + desc), size * (0.04 + r() * 0.12), size * (0.03 + r() * 0.08), r() * 3, 0, Math.PI * 2); fg.fill();
  }
  fg.strokeStyle = st.inner; fg.lineWidth = Math.max(1.5, size * (st.bevel ? 0.07 : 0.06)); shape(fg, 'stroke');
  // 광택: 글자 모양에서 아래로 민 모양을 빼면 윗면 초승달만 남는다
  const [hc, hg] = scratch(2, PW, PH);
  const rim = (dx, dy, col) => {
    hg.setTransform(1, 0, 0, 1, 0, 0); hg.globalCompositeOperation = 'source-over'; hg.clearRect(0, 0, PW, PH);
    hg.drawImage(mc, 0, 0, PW, PH, 0, 0, PW, PH);
    hg.globalCompositeOperation = 'source-in'; hg.fillStyle = col; hg.fillRect(0, 0, PW, PH);
    hg.globalCompositeOperation = 'destination-out'; hg.drawImage(mc, 0, 0, PW, PH, dx * S, dy * S, PW, PH);
    blit(fg, hc);
  };
  const d = Math.max(1, size * 0.04);
  if (st.bevel) { rim(d * 0.7, d, st.hi); rim(-d * 0.7, -d, st.lo); }
  else for (const k of [0.34, 0.67, 1]) rim(0, Math.max(0.6, size * 0.03 * k), st.hi); // 겹쳐 그려 위쪽으로 갈수록 밝은 젖은 광택
  fg.globalCompositeOperation = 'source-over';
  blit(c, fc);

  return { c: out, S, W, H, ox, oy, adv, asc, desc, fAsc, fDesc, drips, st, styleName, fontStr, fontOk: fontLoaded(fontStr, str), checkAt: 0, size, px: 0 };
}
function fontLoaded(fontStr, str) {
  // "… Ext" 확장 글꼴은 기본 파일에 없는 글자에만 쓰이므로 준비 여부 판단에서 뺀다 (넣으면 쓸데없이 내려받는다)
  try { return typeof document === 'undefined' || document.fonts.check(fontStr.replace(/,\s*"[^"]+ Ext"/g, ''), str); } catch { return true; }
}

/** 피 방울 그리기 (캐시 원점 기준 좌표) */
function drawDrips(ctx, e, t, time) {
  const spr = dripSprites(e.st.drip);
  for (const d of e.drips) {
    let k = 1;
    if (t != null) { const u = clamp((t - d.delay) / d.grow, 0, 1); k = 1 - (1 - u) ** 3; }
    if (k <= 0) continue;
    const breathe = 1 + Math.sin(time * 0.6 + d.phase * 6.28) * 0.035;
    const len = d.len * k * breathe;
    const y0 = d.y + d.w * 0.6;
    ctx.drawImage(spr.stem, d.x - d.w / 2, y0, d.w, len);
    // 끝에서 부풀다 떨어지는 방울
    const cyc = (time / d.period + d.phase) % 1;
    let sw = 0.85;
    if (d.falls) {
      if (cyc < 0.72) sw = 0.85 + 0.55 * (cyc / 0.72) ** 2;
      else if (k >= 1) { // 떨어진 방울은 짧게 떨어지다 사라진다 (화면 한가운데 떠 보이지 않도록)
        const ft = (cyc - 0.72) * d.period;
        const fy = y0 + len + d.w * 0.6 + 0.5 * 700 * ft * ft;
        const a = clamp(1 - ft / 0.42, 0, 1);
        if (a > 0) {
          const br = d.w * 0.9;
          ctx.save(); ctx.globalAlpha *= a;
          ctx.drawImage(spr.bulb, d.x - br * 1.2, fy - br * 1.5, br * 2.4, br * 2.7 * (1 + ft * 0.8));
          ctx.restore();
        }
      }
    }
    const br = d.w * sw * 0.8; // 줄기 끝에 맺힌 방울 (줄기보다 굵다)
    ctx.drawImage(spr.bulb, d.x - br * 1.2, y0 + len - br * 1.9, br * 2.4, br * 2.7);
  }
}

/**
 * 피 글씨: 짙은 진홍 그라데이션 + 어두운 안쪽 테 + 젖은 광택 + 글자에서 천천히 흘러내리는 핏방울.
 * 비트맵은 (문자열·크기·글꼴·스타일)별로 캐시되므로 매 프레임 불러도 싸다 (방울만 매 프레임 움직인다).
 * 처음 그릴 때 한 번 굽는 비용이 있으니 장면 enter() 에서 prewarmText(ctx, 같은 문자열, 같은 opts) 를 불러 두면 좋다.
 * 방울은 글자 아래로 최대 글자 크기만큼 흘러내린다 → 바로 아래에 다른 글이 있으면 drips 를 0.3~0.5 로 줄인다.
 *   bloodText(ctx, '본 드래곤', vw/2, 200, { size: 64, t: this.t })
 *   bloodText(ctx, 'STAGE CLEAR', vw/2, 70, { size: 50, style: 'gold', t: this.t })
 * opts:
 *   size=48, weight=900, family=FONT.blood, align='center'|'left'|'right', baseline='alphabetic'|'middle'|'top'|'bottom'
 *   style='blood'|'gold'|'bone' (gold/bone 은 양각 금박·뼈 글씨, 기본적으로 방울 없음)
 *   drips=0~1 (방울 양, 기본은 스타일 값), t=등장 후 경과 초(주면 방울이 처음부터 흘러내리는 연출, 생략하면 다 흘러내린 상태)
 *   time=애니메이션 시계(초, 기본 performance.now), alpha=1, spacing=자간(px), maxWidth, glow=true
 * 반환: { w, h } 실제로 그린 글자 폭(advance)·크기
 */
export function bloodText(ctx, str, x, y, opts = {}) {
  str = String(str ?? '');
  if (!str) return { w: 0, h: 0 };
  const e = textEntry(ctx, str, opts);
  const { align = 'center', baseline = 'alphabetic', t = null, alpha = 1, maxWidth = null } = opts;
  const time = opts.time ?? nowSec();
  const ax = align === 'center' ? e.adv / 2 : align === 'right' || align === 'end' ? e.adv : 0;
  const by = baseline === 'middle' ? (e.fAsc - e.fDesc) / 2 : baseline === 'top' || baseline === 'hanging' ? e.fAsc : baseline === 'bottom' || baseline === 'ideographic' ? -e.fDesc : 0;
  const sx = maxWidth && e.adv > maxWidth ? maxWidth / e.adv : 1;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y + by);
  if (sx !== 1) ctx.scale(sx, 1);
  ctx.translate(-ax - e.ox, -e.oy);
  ctx.drawImage(e.c, 0, 0, e.c.width / e.S, e.c.height / e.S);
  if (e.drips.length) drawDrips(ctx, e, t, time);
  ctx.restore();
  return { w: e.adv * sx, h: e.size };
}
/**
 * 피 글씨 비트맵을 미리 만들어 둔다 (장면 enter() 에서 부르면 처음 보이는 프레임이 끊기지 않는다).
 * opts 는 bloodText 와 같다. 반환: 글자 폭(advance)
 */
export function prewarmText(ctx, str, opts = {}) {
  str = String(str ?? '');
  return str ? textEntry(ctx, str, opts).adv : 0;
}
const nowSec = () => (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);
const RES_STEPS = [1, 1.5, 2, 2.5];
let TXT_PX = 0; // 캐시 비트맵 픽셀 합 (메모리 상한 관리)
const TXT_PX_MAX = 6e6;
function textEntry(ctx, str, opts) {
  const { size = 48, weight = 900, family = FONT.blood, style = 'blood', spacing = 0, glow = true } = opts;
  const st = TEXT_STYLES[style] || TEXT_STYLES.blood;
  const amount = clamp(opts.drips ?? st.drips, 0, 1);
  // 화면 배율에 맞춘 해상도 (계단식). 확대·축소 연출 중에도 매 프레임 다시 굽지 않도록, 이미 더 높은 해상도로 구운 것은 그대로 쓴다
  const tr = ctx?.getTransform ? ctx.getTransform() : { a: 1, b: 0 };
  const want = Math.hypot(tr.a, tr.b) || 1;
  const S = RES_STEPS.find((v) => v >= want * 0.92) ?? RES_STEPS[RES_STEPS.length - 1];
  const key = `${style}|${size}|${weight}|${family}|${spacing}|${amount}|${glow ? 1 : 0}|${str}`;
  let e = TXT_CACHE.get(key);
  const now = nowSec();
  if (e && !e.fontOk && now - e.checkAt > 0.5) { // 글꼴이 늦게 도착하면 다시 굽는다
    e.checkAt = now;
    if (fontLoaded(e.fontStr, str)) e = dropEntry(key);
  }
  if (e && e.S < S) e = dropEntry(key);
  if (!e) {
    e = buildText(str, size, weight, family, style, st, spacing, amount, S, glow);
    e.size = size; e.checkAt = now; e.px = e.c.width * e.c.height;
    if (!e.fontOk) { try { document.fonts.load(e.fontStr, str); } catch { /* 무시 */ } }
    TXT_PX += e.px;
    while (TXT_CACHE.size && (TXT_CACHE.size >= TXT_CACHE_MAX || TXT_PX > TXT_PX_MAX)) dropEntry(TXT_CACHE.keys().next().value);
  } else TXT_CACHE.delete(key);
  TXT_CACHE.set(key, e); // 최근 사용 순서 유지 (LRU)
  return e;
}
function dropEntry(key) {
  const e = TXT_CACHE.get(key);
  if (e) { TXT_PX -= e.px || 0; TXT_CACHE.delete(key); }
  return null;
}
/** 피 글씨 캐시 비우기 (글꼴 교체 등) */
export function clearTextCache() { TXT_CACHE.clear(); TXT_PX = 0; }
// 글꼴 파일이 늦게 도착하면(예: 확장 한글 "… Ext") 그 전에 대체 글꼴로 구운 비트맵을 버리고 다시 굽는다
try { document.fonts.addEventListener('loadingdone', () => { if (TXT_CACHE.size) clearTextCache(); }); } catch { /* 문서 없음(노드 도구) */ }
