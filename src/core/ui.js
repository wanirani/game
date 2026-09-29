// UI 그리기 도우미: 고딕풍 패널, 테두리, 외곽선 텍스트, 피 글씨(bloodText), 버튼(터치/클릭), 목록 메뉴, 게이지, 줄바꿈
import { input } from './input.js';
import { clamp, rgba } from './math.js';

/**
 * 글꼴 묶음. 모든 글꼴은 assets/fonts/ 에 woff2 로 들어 있다 (오프라인·APK 대응).
 * CSS 글꼴(css/style.css 의 @font-face): Noto Sans KR · Hahmlet · Grenze Gotisch · Cinzel · Cinzel Decorative.
 * JS 글꼴(아래 JS_FACES, FontFace API 로 등록): BN Num(작은 숫자) · BN Dmg(데미지 숫자) · BN Brush(붓글씨, 필요할 때 받음) · BN Seal(한자·낙관).
 * 한글 글꼴은 게임에 쓰인 글자(기본 파일) + KS X 1001 한글 2350자의 나머지("… Ext", 필요할 때만 받음)로 서브셋.
 * 새 대사를 넣었으면 python3 tools/fonts/build_fonts.py 로 다시 만든다 (--check 가 빠진 글자를 알려 준다). 새 묶음을 만들 때도 Ext 이름을 기본 글꼴 바로 뒤에 둔다.
 * 피 글씨·블랙레터(blood/logo)는 제목 전용: 로고, 스테이지 제목, 보스 이름, STAGE CLEAR/GAME OVER, 필살기 대사, 메뉴 큰 제목.
 * 본문·목록·20px 미만 숫자·18px 미만 글자에는 쓰지 않는다 (platform §8.1).
 *  - blood  : 큰 제목·보스 이름·STAGE CLEAR 같은 피 글씨 (라틴: Grenze Gotisch 블랙레터 / 한글: Hahmlet 블랙)
 *  - logo   : 영문 장식 제목 (블랙레터, 굵게 900)
 *  - title  : 고딕 세리프 소제목·이름 (Hahmlet, 700~900; 한자는 BN Seal)
 *  - body   : 작은 글씨·대화·설명 (Noto Sans KR, 가독성 우선)
 *  - num    : 숫자·점수 (숫자·숫자 기호는 BN Num 라이닝 숫자 → 작게 써도 1·0 이 I·O 로 읽히지 않는다, 영문은 Cinzel, 한글은 본문 글꼴)
 *             font()/text() 로 24px 이상이면 numDeco(Cinzel 숫자)로 바뀐다 → 큰 점수·제목 숫자는 예전 장식 숫자 그대로
 *  - numDeco: 큰 점수·제목 숫자 전용 장식 숫자 (Cinzel). 작은 글씨에는 쓰지 않는다
 *  - dmg    : 데미지 숫자 (BN Dmg: 굵은 압축 산세리프 라이닝 숫자, CRITICAL 같은 영문도, 한글 꼬리표는 본문 글꼴)
 *  - brush  : 붓글씨 (필살기·각성 이름, 시그니처 대사; 한자 낙관은 BN Seal). 처음 쓸 때(또는 한가할 때) 받으며, 받기 전에는 title 글꼴로 그려진다
 */
export const FONT = {
  body: '"Noto Sans KR", "Noto Sans KR Ext", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  title: '"Hahmlet", "Hahmlet Ext", "BN Seal", serif',
  logo: '"Grenze Gotisch", "Hahmlet", "Hahmlet Ext", "BN Seal", serif',
  blood: '"Grenze Gotisch", "Hahmlet", "Hahmlet Ext", "BN Seal", serif',
  num: '"BN Num", "Cinzel", "Noto Sans KR", "Noto Sans KR Ext", sans-serif',
  numDeco: '"Cinzel", "Noto Sans KR", "Noto Sans KR Ext", sans-serif',
  dmg: '"BN Dmg", "BN Num", "Noto Sans KR", "Noto Sans KR Ext", sans-serif',
  brush: '"BN Brush", "BN Seal", "Hahmlet", "Hahmlet Ext", serif',
};
/** FONT.num 을 이 크기(px) 이상으로 쓰면 장식 숫자(numDeco)로 그린다 */
export const NUM_DECO_MIN = 24;

export const COLORS = {
  gold: '#e8c872', goldDark: '#8a6a2a', blood: '#b3122e', bloodDark: '#4a0612',
  bone: '#efe4cf', ink: '#0b0710', panel: 'rgba(14,8,18,0.88)', panelEdge: '#6e5530',
  text: '#efe4cf', dim: '#9d8f80', good: '#7ee07e', bad: '#ff6060', mp: '#5aa8ff', hp: '#e8283c',
  rarity: ['#d8d0c0', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'],
};
export const RARITY_NAMES = ['일반', '고급', '희귀', '영웅', '전설', '신화'];

/**
 * ctx.font 문자열. 글자 크기 하한(setTextFloor)과 큰 숫자(FONT.num 24px 이상 → numDeco)를 여기서 적용한다
 * → text/wrap/paragraph/button 과, font() 로 재는 모든 장면이 같은 크기로 재고 그린다.
 */
export function font(size, weight = 500, family = FONT.body) {
  if (size < TEXT_FLOOR) size = TEXT_FLOOR;
  if (family === FONT.num && size >= NUM_DECO_MIN) family = FONT.numDeco;
  return `${weight} ${size}px ${family}`;
}

// ───────────────────────── 글자 크기 하한 (platform §6.2) ─────────────────────────
let TEXT_FLOOR = 0;
/**
 * 글자 크기 하한. game.js 가 uiScale 장면을 그리는 동안 setTextFloor(11) 로 켜고, 다 그리면 setTextFloor(0) 으로 끈다.
 * 켜져 있으면 font()/text()/wrap()/paragraph()/button() 의 size 가 max(size, n) 이 된다 (피 글씨 bloodText 는 제외).
 * 반환: 이전 값 (중첩해서 켤 때 되돌리기용)
 */
export function setTextFloor(n = 0) {
  const prev = TEXT_FLOOR;
  TEXT_FLOOR = Math.max(0, Number(n) || 0);
  return prev;
}
/** 지금 글자 크기 하한 (0 = 꺼짐) */
export function textFloor() { return TEXT_FLOOR; }

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
  if (size < TEXT_FLOOR) size = TEXT_FLOOR; // 줄 간격도 하한 크기 기준
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
  ctx.fillStyle = color; ctx.fillRect(x, y, w * ratio, h);   // (쓰이지 않던 그라데이션 생성 제거 — HUD 가 매 프레임 4~5번 부른다, R12)
  if (shine) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x, y, w * ratio, Math.max(1, h * 0.35)); }
  ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/** 포인터가 사각형 안에 있고 이번 프레임에 탭했는지 (새 코드는 taps.add/taps.hit 를 쓴다) */
export function tapped(r) {
  if (taps.record) taps.note(r, 'primary', 'ui.tapped');
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
  hit(i, rect) { this.rects[i] = rect; if (taps.record) taps.note(rect, 'list', 'ListMenu'); }
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
 * FontFace API 로 등록하는 글꼴 (CSS 에 없는 글꼴). tools/fonts/build_fonts.py 의 JS 글꼴·assets/fonts/fonts.json 과 짝이며
 * build_fonts.py --check 가 이 표의 줄 모양 ['이름', '파일', '굵기', 'unicode-range', '받는 때'] 을 그대로 읽어 확인한다.
 * 받는 때: first = 첫 화면 전(FONT_FACES 로 기다림) · early = 첫 화면 뒤 곧바로 · lazy = 처음 쓸 때(또는 한가할 때 미리)
 */
const JS_FACES = [
  ['BN Num', 'bn-num.woff2', '100 900', 'U+0025, U+002B-003A', 'first'],
  ['BN Dmg', 'bn-dmg.woff2', '100 900', 'U+0020-007E, U+00A0-00FF, U+2010-2027, U+2212', 'early'],
  ['BN Brush', 'bn-brush.woff2', '100 900', 'U+0020-007E, U+00A0-00FF, U+2010-2027, U+3000-303F, U+AC00-D7A3, U+FF01-FF5E', 'lazy'],
  ['BN Seal', 'bn-seal.woff2', '100 900', 'U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF', 'early'],
];
/** 글꼴 폴더 (이 모듈 기준 → index.html·아티팩트·APK 어디서 열어도 같은 파일) */
const FONT_DIR = (() => { try { return new URL('../../assets/fonts/', import.meta.url).href; } catch { return 'assets/fonts/'; } })();
const FACES = new Map(); // 이름 → FontFace
(function registerFaces() {
  const fs = typeof document !== 'undefined' ? document.fonts : null;
  if (!fs?.add || typeof FontFace === 'undefined') return;
  for (const [family, file, weight, unicodeRange] of JS_FACES) {
    try {
      const f = new FontFace(family, `url("${FONT_DIR}${file}") format("woff2")`, { weight, unicodeRange, style: 'normal', display: 'swap' });
      fs.add(f); // 등록만 한다: 이 이름으로 글자를 그리거나 load() 할 때 받는다
      FACES.set(family, f);
    } catch (e) { console.warn('글꼴 등록 실패', family, e); }
  }
})();
/** 등록한 글꼴 하나를 받는다. 반환: 준비되면 true (없거나 실패하면 false, 오류를 던지지 않는다) */
export function loadFace(family) {
  const f = FACES.get(family);
  if (!f) return Promise.resolve(false);
  if (f.status === 'loaded') return Promise.resolve(true);
  return f.load().then(() => true, () => false);
}
/** 붓글씨(FONT.brush) 글꼴을 미리 받는다 — 컷인·각성 장면 enter() 에서 부르면 첫 장면부터 붓글씨로 나온다 */
export function loadBrush() { return loadFace('BN Brush'); }
/** 글꼴이 준비되었는지 (FontFace 로 등록한 글꼴 이름) */
export function faceReady(family) { return FACES.get(family)?.status === 'loaded'; }

/**
 * 첫 화면 전에 받아 둘 글꼴 (css/style.css 의 @font-face 와 JS_FACES 의 first). 가변 굵기 파일이라 글꼴마다 하나씩이면 된다.
 * "Nanum Myeongjo" 는 예전 코드(타이틀 로고 부제)가 부르는 이름으로, Hahmlet 파일을 가리킨다. "… Ext" 확장 한글은 필요할 때만 받는다.
 */
export const FONT_FACES = [
  '700 16px "Noto Sans KR"', '800 16px "Hahmlet"', '800 16px "Nanum Myeongjo"',
  '900 16px "Grenze Gotisch"', '900 16px "Cinzel"', '900 16px "Cinzel Decorative"', '800 16px "BN Num"',
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
// 첫 화면 뒤: 데미지 숫자·한자 글꼴(작다)은 곧바로, 붓글씨(큼)는 몇 초 뒤 한가할 때 미리 받는다 (데이터 절약 모드·2G 에서는 처음 쓸 때 받는다)
for (const [family, , , , when] of JS_FACES) if (when === 'early') loadFace(family);
loadPlusFaces();
/**
 * 한글 기본 글꼴이 첫 화면 예산을 넘으면 build_fonts.py 가 덜 쓰이는 글자를 "plus" 파일로 나눠 fonts.json 에 적는다.
 * 같은 글꼴 이름 + 정확한 unicode-range 로 등록하면 그 글자만 plus 파일에서 그려진다 (CSS·FONT 묶음은 그대로) → 첫 화면 뒤 곧바로 받는다.
 */
function loadPlusFaces() {
  const fs = typeof document !== 'undefined' ? document.fonts : null;
  if (!fs?.add || typeof FontFace === 'undefined' || typeof fetch === 'undefined') return;
  fetch(`${FONT_DIR}fonts.json`).then((r) => (r.ok ? r.json() : [])).then((list) => {
    for (const i of Array.isArray(list) ? list : []) {
      if (i?.part !== 'plus' || !i.urange || !i.file) continue;
      for (const family of [i.family, ...(i.alias ?? [])]) {
        try {
          const f = new FontFace(family, `url("${FONT_DIR}${i.file}") format("woff2")`, { weight: i.weight || '100 900', unicodeRange: i.urange, style: 'normal', display: 'swap' });
          fs.add(f); FACES.set(`${family}+`, f);
          f.load().catch(() => {});
        } catch (e) { console.warn('글꼴 등록 실패', family, e); }
      }
    }
  }).catch(() => { /* 오프라인 등: 기본·확장 글꼴로 그린다 */ });
}
if (typeof window !== 'undefined' && FACES.has('BN Brush')) {
  const cn = navigator.connection;
  if (!cn?.saveData && !/(^|-)2g$/.test(cn?.effectiveType ?? '')) {
    setTimeout(() => { const go = () => loadBrush(); if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 }); else go(); }, 6000);
  }
}

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
// 캐시 비트맵 캔버스 풀 (R1-REQ-339P, feel §8 '스테이지 시작 뒤 새 캔버스 0'): 캐시에서 내린 비트맵의 캔버스는 1×1 로 줄여 여기 두었다가
// 다음 글씨에 다시 쓴다. 비어 있으면 1초 넘게 그리지 않은 캐시 항목의 캔버스를 가져온다. 부팅 때(모듈을 읽을 때) 미리 만들어 둔다
const TXT_FREE = [];
const TXT_POOL = 12, TXT_FREE_MAX = 24;
function takeTextCanvas(w, h) {
  let c = TXT_FREE.pop();
  if (!c) {
    const now = nowSec();
    for (const [k, e] of TXT_CACHE) { if (now - (e.used ?? 0) > 1) { dropEntry(k); c = TXT_FREE.pop(); break; } }
  }
  if (!c) c = mkCanvas(1, 1); // 풀도 비고 모두 지금 쓰는 중: 어쩔 수 없이 새로
  c.width = w; c.height = h; // 크기 지정 = 초기화 (같은 크기여도 비트맵·상태를 지운다)
  return c;
}
function freeTextCanvas(c) {
  if (!c || TXT_FREE.length >= TXT_FREE_MAX) return;
  try { c.width = 1; c.height = 1; TXT_FREE.push(c); } catch { /* 무시 */ }
}
/** 피 글씨용 작업 캔버스·풀·방울 스프라이트를 미리 만든다 (부팅 때 한 번; 스테이지 도중 새 캔버스를 만들지 않게) */
export function prewarmTextCanvases() {
  try {
    if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return;
    for (let i = 0; i <= 6; i++) SCRATCH[i] ||= mkCanvas(1, 1);
    while (TXT_FREE.length < TXT_POOL) TXT_FREE.push(mkCanvas(1, 1));
    for (const st of Object.values(TEXT_STYLES)) if (st?.drip) dripSprites(st.drip);
  } catch (e) { console.warn('[ui] prewarm text canvases', e); }
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

  const out = takeTextCanvas(PW, PH), c = out.getContext('2d');
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
    e.size = size; e.checkAt = now; e.px = e.c.width * e.c.height; e.str = str;
    if (!e.fontOk) { try { document.fonts.load(e.fontStr, str); } catch { /* 무시 */ } }
    TXT_PX += e.px;
    while (TXT_CACHE.size && (TXT_CACHE.size >= TXT_CACHE_MAX || TXT_PX > TXT_PX_MAX)) dropEntry(TXT_CACHE.keys().next().value);
  } else TXT_CACHE.delete(key);
  TXT_CACHE.set(key, e); // 최근 사용 순서 유지 (LRU)
  e.used = now;
  return e;
}
function dropEntry(key) {
  const e = TXT_CACHE.get(key);
  if (e) { TXT_PX -= e.px || 0; TXT_CACHE.delete(key); freeTextCanvas(e.c); }
  return null;
}
/** 피 글씨 캐시 비우기 (글꼴 교체 등) */
export function clearTextCache() { for (const e of TXT_CACHE.values()) freeTextCanvas(e.c); TXT_CACHE.clear(); TXT_PX = 0; }

// ───────────────────────── 글꼴 세대 (platform P-28) ─────────────────────────
/**
 * 글꼴 세대 번호. document.fonts 의 loadingdone(글꼴 파일 도착)마다 1 씩 오른다.
 * 글자를 비트맵으로 캐시하는 곳(메뉴 Layer, 데미지 숫자 아틀라스 등)은 캐시 키에 넣거나 값이 바뀌면 다시 굽는다
 * → 글꼴이 늦게 도착해도 대체 글꼴로 구운 글자가 남지 않는다.  import * as ui … ui.fontEpoch  또는  import { fontEpoch } (살아 있는 바인딩)
 */
export let fontEpoch = 0;
const EPOCH_FNS = new Set();
/**
 * 글꼴 세대가 바뀔 때마다 fn(fontEpoch, families) 호출 (예: game.dirty = true). families = 이번에 도착한 글꼴 이름 배열
 * (모르면 빈 배열) → 데미지 숫자 아틀라스처럼 특정 글꼴만 쓰는 캐시는 families.includes('BN Dmg') 일 때만 다시 구우면 된다. 반환: 구독 해제 함수
 */
export function onFontEpoch(fn) { EPOCH_FNS.add(fn); return () => EPOCH_FNS.delete(fn); }
const UR_CACHE = new Map(); // unicode-range 문자열 → [[처음, 끝], …]
function urangeOf(ur) {
  let r = UR_CACHE.get(ur);
  if (r) return r;
  r = [];
  for (const part of String(ur || '').split(',')) {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part);
    if (!m) continue;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = parseInt(m[2] ?? m[1].replace(/\?/g, 'f'), 16);
    if (hi >= lo) r.push([lo, hi]);
  }
  if (!r.length) r.push([0, 0x10ffff]);
  UR_CACHE.set(ur, r);
  return r;
}
/** 글꼴 면(FontFace)의 unicode-range 가 문자열의 글자를 하나라도 덮는지 */
function faceCovers(face, str) {
  const r = urangeOf(face.unicodeRange);
  for (const ch of str) { const c = ch.codePointAt(0); for (const [a, b] of r) if (c >= a && c <= b) return true; }
  return false;
}
function bumpFontEpoch(ev) {
  fontEpoch++;
  const faces = ev?.fontfaces ? [...ev.fontfaces] : [];
  const fams = faces.map((f) => String(f.family).replace(/^["']|["']$/g, ''));
  // 늦게 도착한 글꼴(예: 확장 한글 "… Ext", 붓글씨) 전에 대체 글꼴로 구운 피 글씨를 버린다 (다음에 그릴 때 다시 굽는다).
  // 버리는 것: 글꼴이 덜 준비된 채 구운 비트맵 + 도착한 글꼴을 묶음에 넣고 그 글꼴의 unicode-range 에 드는 글자가 있는 비트맵.
  // 나머지는 그대로 둔다 → 첫 화면 직후 한자(BN Seal)·데미지 숫자 글꼴이 도착해도 영문·한글 제목을 다시 굽지 않는다 (끊김 없음)
  if (TXT_CACHE.size) {
    if (!faces.length) clearTextCache();
    else for (const [k, e] of [...TXT_CACHE]) if (!e.fontOk || faces.some((f, i) => e.fontStr.includes(`"${fams[i]}"`) && (e.str == null || faceCovers(f, e.str)))) dropEntry(k);
  }
  for (const fn of EPOCH_FNS) { try { fn(fontEpoch, fams); } catch (e) { console.error(e); } }
}
try { document.fonts.addEventListener('loadingdone', bumpFontEpoch); } catch { /* 문서 없음(노드 도구) */ }
prewarmTextCanvases(); // 부팅 때 피 글씨 작업 캔버스·풀을 만들어 둔다 (R1-REQ-339P)
// 화면 크기가 바뀌면 피 글씨 캐시를 비운다 (배율이 바뀌어 예전 해상도 비트맵은 메모리만 차지한다; 다음 그릴 때 새 배율로 굽는다)
let resizeT = 0;
try {
  window.addEventListener('resize', () => {
    TAP_CSSK = 0;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (TXT_CACHE.size) clearTextCache(); }, 300);
  });
} catch { /* 창 없음(노드 도구) */ }

// ───────────────────────── 탭 영역 공용 등록부 (platform §6.3) ─────────────────────────
/**
 * 모든 장면이 함께 쓰는 탭 영역 등록부. TapZones 와 같은 방식(render 에서 등록 → 다음 update 에서 판정)에 여유 영역(slop)을 더했다.
 *   render: taps.add('buy', r, { owner: this, kind: 'primary' })   // 그린 버튼 영역 등록 (반환: r)
 *   update: const id = taps.hit(this); if (id === 'buy') …        // 이번 틱에 탭된 영역 id (위에 그린 것 우선), 없으면 null
 * - 한 번의 그리기(rAF 한 번)에 등록한 영역이 한 묶음이다. 묶음은 그 rAF 가 끝날 때 자동으로 닫히고(마이크로태스크), hit() 는 마지막으로
 *   닫힌 묶음을 본다 → 게임 루프에 따로 부를 것이 없다. owner 를 주면 그 장면이 등록한 영역만 판정한다 (아래 장면의 버튼이 눌리지 않게).
 * - 판정: 영역 안이면 그 영역(위에 그린 것 우선). 터치 모드에서는 영역 밖이어도 여유(slop) 안이면 가장 가까운 영역.
 *   여유 = max(opts.slop ?? taps.slop, kind 의 최소 크기(CSS px)에 모자란 만큼의 절반) → 작게 그린 아이콘도 44 CSS px 로 눌린다.
 * - kind(최소 CSS px): 'primary' 주 버튼 44 · 'list' 목록 줄 36 · 'icon' 아이콘·화살표 44×44 · 'dense' 촘촘한 정보 줄 28
 * - 예전 도우미(ListMenu.hit, ui.tapped, TapZones.add, Hits.add, Gesture.tap)는 taps.note(r, kind, src) 로 영역만 알린다
 *   (taps.record 일 때만 모음, 판정에는 안 씀) → ?debug=taps 오버레이와 QA 감사가 모든 영역을 본다.
 * - ?debug=taps : 등록된 모든 영역을 화면에 그린다 (초록 OK · 노랑 최소 미달 · 빨강 32 CSS px 미만, 점선 = 여유 영역).
 *   game.js 가 render 끝에서 taps.drawDebug(ctx) 를 부르면 거기서 그리고, 아니면 묶음이 닫힐 때 스스로 그린다.
 * - game.js(uiScale): 장면을 ctx.scale(uiK) 로 그리는 동안 taps.setSpace(uiK) → 영역 좌표가 UI 공간임을 기록한다 (끝나면 1).
 *   game.cssScale 을 알면 taps.cssScale 에 넣어 준다 (없으면 캔버스 크기로 잰다).
 * - QA: taps.audit() → [{id, src, kind, x, y, w, h, k, css, hitCss, min, status: 'ok'|'small'|'tiny'}] (마지막 묶음)
 */
const TAP_MIN = { primary: 44, list: 36, icon: 44, dense: 28 };
const TAP_TINY = 32;
const TAP_SLOP_MAX = 28; // 여유 상한 (논리 px)
const VIEW_H = 540; // 논리 화면 높이 (core/game.js)
let TAP_CSSK = 0; // 논리 px → CSS px (0 = 다시 잰다)
const tapNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function tapCssK() {
  if (taps.cssScale > 0) return taps.cssScale;
  if (!TAP_CSSK) {
    try {
      const c = document.getElementById('screen');
      const h = c ? c.getBoundingClientRect().height : 0;
      TAP_CSSK = h > 0 ? h / VIEW_H : 1;
    } catch { TAP_CSSK = 1; }
  }
  return TAP_CSSK;
}
function tapSlop(z) {
  const per = z.k * tapCssK(); // 영역 1 px 이 몇 CSS px 인지
  const need = per > 0 ? (TAP_MIN[z.kind] ?? TAP_MIN.primary) / per : 0;
  return clamp(Math.max(z.slop, (need - Math.min(z.w, z.h)) / 2), 0, TAP_SLOP_MAX);
}
function tapOpen() {
  if (taps._open) return;
  taps._open = true; taps._n = 0;
  // 지금 도는 rAF(또는 이벤트) 콜백이 끝나면 묶음을 닫는다 (queueMicrotask 가 없는 옛 웹뷰는 Promise 로)
  if (typeof queueMicrotask === 'function') queueMicrotask(tapSeal); else Promise.resolve().then(tapSeal);
}
function tapSeal() {
  if (!taps._open) return;
  taps._open = false;
  const a = taps._list; taps._list = taps._cur; taps._cur = a;
  taps.n = taps._n; taps.sealedAt = tapNow();
  if (taps.debug && !taps._drawn) {
    try {
      const c = document.getElementById('screen'), ctx = c?.getContext('2d');
      if (ctx) { ctx.save(); const s = c.height / VIEW_H; ctx.setTransform(s, 0, 0, s, 0, 0); taps.drawDebug(ctx); ctx.restore(); }
    } catch { /* 디버그 그리기 실패는 무시 */ }
  }
  taps._drawn = false;
}
function tapPush(id, r, slop, kind, src, owner, hit) {
  tapOpen();
  const z = taps._cur[taps._n] ||= { id: null, x: 0, y: 0, w: 0, h: 0, slop: 0, kind: 'primary', src: '', owner: null, k: 1, hit: true };
  taps._n++;
  z.id = id; z.x = r.x; z.y = r.y; z.w = r.w; z.h = r.h; z.slop = slop; z.kind = kind; z.src = src; z.owner = owner; z.k = taps.space; z.hit = hit;
  return z;
}

export const taps = {
  /** 기본 여유 영역 (논리 px, 터치 모드에서만) */
  slop: 6,
  /** kind 별 최소 크기 (CSS px) */
  min: TAP_MIN,
  /** ?debug=taps 오버레이 */
  debug: false,
  /** 예전 도우미의 note() 를 모을지 (debug 이거나 QA 가 켠다) */
  record: false,
  /** 지금 등록하는 영역의 좌표 배율 (uiScale 장면 = uiK) */
  space: 1,
  /** 논리 px → CSS px (0 이면 캔버스로 잰다) */
  cssScale: 0,
  /** 마지막 묶음이 이보다(ms) 오래되면 판정하지 않는다 (장면이 바뀐 뒤 옛 버튼이 눌리지 않게) */
  maxAge: 1000,
  n: 0, sealedAt: 0,
  _list: [], _cur: [], _n: 0, _open: false, _drawn: false,

  /**
   * 탭 영역 등록 (render 에서, 그린 순서 = 아래 → 위). 반환: r
   * opts: slop(논리 px), kind('primary'|'list'|'icon'|'dense'), owner(보통 장면 this), disabled(그리기만, 판정 안 함), src(디버그 이름)
   */
  add(id, r, { slop = taps.slop, kind = 'primary', owner = null, disabled = false, src = 'taps' } = {}) {
    if (r && r.w > 0 && r.h > 0) tapPush(id, r, slop, kind, src, owner, !disabled);
    return r;
  },
  /** 예전 도우미가 영역만 알린다 (판정 안 함, record 일 때만) */
  note(r, kind = 'primary', src = 'legacy') {
    if (this.record && r && r.w > 0 && r.h > 0) tapPush(null, r, 0, kind, src, null, false);
    return r;
  },
  /** (x, y) 에 있는 영역 (owner 를 주면 그 owner 것만). 없으면 null */
  at(x, y, owner = null) {
    if (!this.n || tapNow() - this.sealedAt > this.maxAge) return null;
    const touch = !!input.touchMode;
    let best = null, bestD = Infinity;
    for (let i = this.n - 1; i >= 0; i--) {
      const z = this._list[i];
      if (!z.hit || (owner != null && z.owner !== owner)) continue;
      const dx = x < z.x ? z.x - x : x > z.x + z.w ? x - (z.x + z.w) : 0;
      const dy = y < z.y ? z.y - y : y > z.y + z.h ? y - (z.y + z.h) : 0;
      if (dx === 0 && dy === 0) return z; // 영역 안: 위에 있는 것 우선
      if (!touch) continue;
      const s = tapSlop(z);
      if (dx <= s && dy <= s) { const d = Math.hypot(dx, dy); if (d < bestD) { bestD = d; best = z; } }
    }
    return best;
  },
  /** 이번 틱에 탭된 영역의 id (owner 를 주면 그 owner 것만). 없으면 null — update 에서 부른다 */
  hit(owner = null) {
    const p = input.pointer;
    if (!p?.tapped) return null;
    const z = this.at(p.x, p.y, owner);
    return z ? z.id : null;
  },
  /** 포인터(마우스)가 올라가 있는 영역의 id. 없으면 null */
  over(owner = null) {
    const p = input.pointer;
    if (!p?.active || input.touchMode) return null;
    const z = this.at(p.x, p.y, owner);
    return z ? z.id : null;
  },
  /** 모든 영역을 버린다 (장면을 통째로 바꿀 때) */
  clear() { this.n = 0; this._n = 0; this.sealedAt = 0; },
  /** uiScale 장면을 그리는 동안의 좌표 배율. 반환: 이전 값 */
  setSpace(k = 1) { const prev = this.space; this.space = k > 0 ? k : 1; return prev; },
  /** 지금 보이는 영역 목록 (그리는 중이면 이번 묶음, 아니면 마지막 묶음) — 복사본 */
  zones() {
    const [list, n] = this._open ? [this._cur, this._n] : [this._list, this.n];
    return list.slice(0, n).map((z) => ({ ...z }));
  },
  /** QA 감사: 영역마다 CSS px 크기와 판정 (마지막 묶음 기준) */
  audit() {
    const k0 = tapCssK();
    return this.zones().map((z) => {
      const per = z.k * k0, min = TAP_MIN[z.kind] ?? TAP_MIN.primary;
      const css = Math.min(z.w, z.h) * per;
      const hitCss = z.hit ? (Math.min(z.w, z.h) + 2 * tapSlop(z)) * per : css;
      return {
        id: typeof z.id === 'object' && z.id !== null ? JSON.stringify(z.id) : z.id, src: z.src, kind: z.kind, hit: z.hit,
        x: z.x, y: z.y, w: z.w, h: z.h, k: z.k, css: Math.round(css * 10) / 10, hitCss: Math.round(hitCss * 10) / 10, min,
        status: hitCss >= min ? 'ok' : hitCss >= TAP_TINY ? 'small' : 'tiny',
      };
    });
  },
  /**
   * ?debug=taps 오버레이. game.js 가 render 끝(논리 좌표 변환 상태)에서 부르면 이번 프레임 영역을 그린다.
   * 초록 = 최소 크기 이상 · 노랑 = 최소 미달 · 빨강 = 32 CSS px 미만. 점선 = 터치 여유 영역, 회색 선 = 예전 도우미가 알린 영역
   */
  drawDebug(ctx) {
    if (!ctx) return;
    if (this._open) this._drawn = true;
    const list = this.audit();
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1.5; ctx.font = '700 10px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (const z of list) {
      const x = z.x * z.k, y = z.y * z.k, w = z.w * z.k, h = z.h * z.k;
      const col = z.status === 'ok' ? '#3ee06a' : z.status === 'small' ? '#ffd23a' : '#ff3a3a';
      ctx.fillStyle = rgba(col, 0.14); ctx.fillRect(x, y, w, h);
      ctx.setLineDash(z.hit ? [] : [2, 3]);
      ctx.strokeStyle = col; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (z.hit && z.hitCss > z.css) {
        const s = ((z.hitCss - z.css) / 2) / Math.max(1e-6, tapCssK()); // 여유(논리 px)
        ctx.setLineDash([4, 4]); ctx.strokeStyle = rgba(col, 0.6);
        ctx.strokeRect(x - s, y - s, w + 2 * s, h + 2 * s);
      }
      ctx.setLineDash([]);
      const label = `${Math.round(z.hitCss)}${z.src !== 'taps' ? ' ' + z.src : ''}`;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, ctx.measureText(label).width + 4, 12);
      ctx.fillStyle = col; ctx.fillText(label, x + 2, y + 1);
    }
    ctx.restore();
  },
};
try {
  const q = new URLSearchParams(location.search).getAll('debug');
  if (q.some((v) => v.split(',').includes('taps'))) { taps.debug = true; taps.record = true; }
} catch { /* 주소 없음(노드 도구) */ }
