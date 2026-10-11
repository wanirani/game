// Viewport matrix of the platform audit (platform.md §1.1).
// Each entry has the Playwright context options and the game's logical size for that screen
// (16:9 and wider: logical height 540, width clamped to 960..1280; squarer screens — fold open, 4:3 tablet — keep width 960
// and grow the logical height to clamp(960 / aspect, 540, 760), hud_mobile §2 / game.viewSize).
//
//   import { VIEWPORTS, phone1, phone2, tablet, contextOptions, logicalSize } from './viewports.mjs';
//   phone1.vw === 1169, phone2.vw === 1110, tablet.vw === 960   (default safeArea, no insets)
//   (MASTER_PLAN §1.8 writes 1168 for phone1: game.resize rounds 540 × 844 / 390 = 1168.6 up to 1169, which is what
//    the game really lays out with; anything that needs the plan's figure should read phone1.vw, not hard-code it)
//   await browser.newContext(contextOptions('phone2'))

export const VIEW_H = 540;
export const MIN_VIEW_W = 960;
export const MAX_VIEW_W = 1280;
export const MAX_VIEW_H = 760;

/**
 * Logical size and CSS scale for a CSS viewport, following game.resize() / game.viewSize():
 *  aspect >= 16:9: vw = round(clamp(540 * w / h, 960, 1280)), vh = 540
 *  squarer       : vw = 960, vh = round(clamp(960 * h / w, 540, 760)) (tall view; the canvas then fills the screen)
 * canvas CSS = floor(vw * s) x floor(vh * s), s = min(w / vw, h / vh) (tall view: a 1-2 px shortfall is filled).
 * insets {l,r,t,b} (CSS px) model safeArea 'fit': the canvas is laid out inside the safe rect.
 */
export function logicalSize(cssW, cssH, insets = null) {
  const w = cssW - (insets ? (insets.l || 0) + (insets.r || 0) : 0);
  const h = cssH - (insets ? (insets.t || 0) + (insets.b || 0) : 0);
  const a = w / h;
  let vw, vh;
  if (a >= MIN_VIEW_W / VIEW_H - 1e-9) { vw = Math.round(Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, VIEW_H * a))); vh = VIEW_H; }
  else { vw = MIN_VIEW_W; vh = Math.round(Math.min(MAX_VIEW_H, Math.max(VIEW_H, MIN_VIEW_W / a))); }
  const s = Math.min(w / vw, h / vh);
  let canvasW = Math.floor(vw * s), canvasH = Math.floor(vh * s);
  if (vh !== VIEW_H) { if (w - canvasW <= 2) canvasW = Math.floor(w); if (h - canvasH <= 2) canvasH = Math.floor(h); }
  return { vw, vh, cssScale: +(canvasH / vh).toFixed(4), canvasW, canvasH };
}

function vp(id, w, h, dpr, touch, extra = {}) {
  const L = logicalSize(w, h);
  return {
    id, css: { w, h }, dpr, touch,
    vw: L.vw, vh: L.vh, cssScale: L.cssScale, canvas: { w: L.canvasW, h: L.canvasH },
    context: touch
      ? { viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: true, isMobile: true }
      : { viewport: { width: w, height: h }, deviceScaleFactor: dpr },
    ...extra,
  };
}

/** Phones and tablet (touch), desktops (keyboard/mouse). The 'size' is the touch pad size class (platform §5.2). */
export const phone1 = vp('phone1', 844, 390, 3, true, { size: 'S', quality: 'medium' });
export const phone2 = vp('phone2', 740, 360, 3, true, { size: 'S', quality: 'medium' });
export const tablet = vp('tablet', 1024, 768, 2, true, { size: 'L', quality: 'medium' });   // 4:3 → tall view 960×720
// Galaxy Z Fold 8 (hud_mobile §5; the user's capture is 2000×1510 px): open ≈ 1.32 : 1, square-ish inner, cover ≈ 21:9
export const fold_open = vp('fold_open', 1000, 756, 2.6, true, { size: 'L', quality: 'medium' });      // tall view 960×726
export const fold_open_sq = vp('fold_open_sq', 900, 818, 2.6, true, { size: 'L', quality: 'medium' }); // 1.1 : 1 → 960×760 + band
export const fold_cover = vp('fold_cover', 968, 410, 2.6, true, { size: 'S', quality: 'medium' });
export const desk = vp('desk', 1280, 720, 1, false, { quality: 'high' });
export const fhd = vp('fhd', 1920, 1080, 1, false, { quality: 'high' });
export const fhd2x = vp('fhd2x', 1920, 1080, 2, false, { quality: 'high' });
export const ultra = vp('ultra', 2560, 1080, 1, false, { quality: 'high' });

export const VIEWPORTS = { phone1, phone2, tablet, fold_open, fold_open_sq, fold_cover, desk, fhd, fhd2x, ultra };
export const TOUCH_VIEWPORTS = ['phone1', 'phone2', 'tablet', 'fold_open', 'fold_open_sq', 'fold_cover'];
export const ALL_VIEWPORTS = Object.keys(VIEWPORTS);

/** Standard iPhone-like insets used by the audit (CSS px). */
export const NOTCH_INSETS = { l: 47, r: 47, t: 0, b: 21 };

/** Playwright context options for a viewport id (a fresh copy, safe to extend). */
export function contextOptions(id, extra = {}) {
  const v = VIEWPORTS[id];
  if (!v) throw new Error(`unknown viewport '${id}' (known: ${ALL_VIEWPORTS.join(', ')})`);
  return { ...structuredClone(v.context), ...extra };
}

/** Pixel budget per quality tier in megapixels (platform §6.4, MASTER_PLAN §5.2). */
export const PIXEL_BUDGET_MP = { low: 1.0, medium: 1.6, high: 3.7 };
export const DPR_CAP = { low: 1.0, medium: 1.5, high: 2.0 };
