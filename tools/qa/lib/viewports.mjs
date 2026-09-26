// Viewport matrix of the platform audit (platform.md §1.1).
// Each entry has the Playwright context options and the game's logical size for that screen
// (the game draws at a fixed logical height of 540 px and a width clamped to 960..1280).
//
//   import { VIEWPORTS, phone1, phone2, tablet, contextOptions, logicalSize } from './viewports.mjs';
//   phone1.vw === 1168, phone2.vw === 1110, tablet.vw === 960   (default safeArea, no insets)
//   await browser.newContext(contextOptions('phone2'))

export const VIEW_H = 540;
export const MIN_VIEW_W = 960;
export const MAX_VIEW_W = 1280;

/**
 * Logical size and CSS scale for a CSS viewport, following game.resize():
 * vw = round(clamp(540 * w / h, 960, 1280)), canvas CSS = floor(vw * s) x floor(540 * s), s = min(w / vw, h / 540).
 * insets {l,r,t,b} (CSS px) model safeArea 'fit': the canvas is laid out inside the safe rect.
 */
export function logicalSize(cssW, cssH, insets = null) {
  const w = cssW - (insets ? (insets.l || 0) + (insets.r || 0) : 0);
  const h = cssH - (insets ? (insets.t || 0) + (insets.b || 0) : 0);
  const vw = Math.round(Math.min(MAX_VIEW_W, Math.max(MIN_VIEW_W, (VIEW_H * w) / h)));
  const s = Math.min(w / vw, h / VIEW_H);
  const canvasW = Math.floor(vw * s), canvasH = Math.floor(VIEW_H * s);
  return { vw, vh: VIEW_H, cssScale: +(canvasH / VIEW_H).toFixed(4), canvasW, canvasH };
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
export const tablet = vp('tablet', 1024, 768, 2, true, { size: 'L', quality: 'medium' });
export const desk = vp('desk', 1280, 720, 1, false, { quality: 'high' });
export const fhd = vp('fhd', 1920, 1080, 1, false, { quality: 'high' });
export const fhd2x = vp('fhd2x', 1920, 1080, 2, false, { quality: 'high' });
export const ultra = vp('ultra', 2560, 1080, 1, false, { quality: 'high' });

export const VIEWPORTS = { phone1, phone2, tablet, desk, fhd, fhd2x, ultra };
export const TOUCH_VIEWPORTS = ['phone1', 'phone2', 'tablet'];
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
