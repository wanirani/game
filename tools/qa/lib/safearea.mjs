// Safe-area helpers (platform.md §6.1, P-02): CDP inset override, env() probe, canvas and HUD placement.
//
//   const s = await env.page('phone1', 'index.html?scene=stage&stage=s04', { insets: NOTCH_INSETS });
//   await probeInsets(s.page)      → {l, r, t, b}  what env(safe-area-inset-*) reports (CSS px)
//   await canvasBox(s.page)        → {x, y, w, h, right, bottom, innerW, innerH}
//   insideSafe(box, insets, inner) → {ok, overflow: {l, r, t, b}}
export { NOTCH_INSETS } from './viewports.mjs';
export { setSafeAreaInsets } from './server.mjs';

export function probeInsets(page) {
  return page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:env(safe-area-inset-left,0px);right:env(safe-area-inset-right,0px);top:env(safe-area-inset-top,0px);bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden';
    document.body.appendChild(d);
    const r = d.getBoundingClientRect();
    d.remove();
    return { l: Math.round(r.left), r: Math.round(innerWidth - r.right), t: Math.round(r.top), b: Math.round(innerHeight - r.bottom) };
  });
}

export function canvasBox(page) {
  return page.evaluate(() => {
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom, innerW: innerWidth, innerH: innerHeight };
  });
}

/** Is a client-px box inside the safe rect? overflow = px outside per side (0 = fine), 0.5 px tolerance. */
export function insideSafe(box, insets, inner) {
  const right = box.right ?? box.x + box.w, bottom = box.bottom ?? box.y + box.h;
  const overflow = {
    l: Math.max(0, insets.l - box.x),
    r: Math.max(0, right - (inner.w - insets.r)),
    t: Math.max(0, insets.t - box.y),
    b: Math.max(0, bottom - (inner.h - insets.b)),
  };
  const ok = Object.values(overflow).every((v) => v <= 0.5);
  return { ok, overflow: Object.fromEntries(Object.entries(overflow).map(([k, v]) => [k, +v.toFixed(1)])) };
}

/**
 * HUD portrait box in client px (MASTER_PLAN §1.8: logical x 14–80, y 12–78, + game.safe in safeArea 'full').
 * Uses hudLayout() rects when src/render/hud_layout.js provides a 'portrait' rect.
 */
export function hudPortraitBox(page) {
  return page.evaluate(async () => {
    const g = window.__game;
    let r = { x: 14, y: 12, w: 66, h: 66 };
    try {
      const H = await import('/src/render/hud_layout.js');
      const L = H.hudLayout?.(g.world, g.viewW, g.viewH);
      const p = L?.portrait || L?.rects?.portrait;
      if (p && p.w > 0) r = p;
      else if (g.settings?.safeArea === 'full' && g.safe) r = { ...r, x: r.x + (g.safe.l || 0), y: r.y + (g.safe.t || 0) };
    } catch { /* no layout module */ }
    const cv = g.canvas.getBoundingClientRect();
    const k = cv.height / g.viewH;
    return { x: cv.x + r.x * k, y: cv.y + r.y * k, w: r.w * k, h: r.h * k, right: cv.x + (r.x + r.w) * k, bottom: cv.y + (r.y + r.h) * k };
  });
}
