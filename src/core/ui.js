// UI 그리기 도우미: 고딕풍 패널, 테두리, 외곽선 텍스트, 버튼(터치/클릭), 목록 메뉴, 게이지, 줄바꿈
import { input } from './input.js';
import { clamp, rgba } from './math.js';

export const FONT = {
  body: '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  title: '"Nanum Myeongjo", "Noto Serif KR", serif',
  logo: '"Cinzel Decorative", "Cinzel", "Nanum Myeongjo", serif',
  num: '"Cinzel", "Noto Sans KR", serif',
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
