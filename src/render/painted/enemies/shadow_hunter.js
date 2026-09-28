// T2 rig reuse: 그림자 헌터 (shadow_hunter) — the player's own hero puppet (drawHero: the painted cut-out puppet when the
// hero's assets are loaded, else the vector hero) re-rendered as a living shadow: composited once per frame into a scratch
// canvas, stained violet-black with a violet under-light rising from the ink pool at its feet and a violet rim, standing in a
// painted ink puddle with painted smoke wisps curling up around the legs. Behind it looms the hunter's true shape — a painted
// grinning shadow wraith — faint while it waits, surging up and reaching forward over the hunter's shoulders on every strike.
// Own atlas = only that painted shadow FX (1 kept Kling image, docs/art/ENEMY_PIPELINE.md §7 rig reuse).
// Driven by AI_B.shadow (mimics the player half a beat late): heroAnim / heroAnimT / mv / mvT / dashT are passed straight to
// drawHero, exactly like the vector fallback — every hero anim and every move of the player's weapon (idle, run, jump/fall,
// dash, lash/slash/thrust/shot/cast…) is covered by the puppet itself. dash = two dark afterimages + smoke trail · run = one
// faint smear · hurt = white flash, recoil shiver and a violet flare · death = the silhouette tears into rising bands of
// smoke from the head down while the wraith rises out of it, grins once and fades (outlives the entity).
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { drawHero } from '../../hero.js';

export const spec = {
  id: 'shadow_hunter', tier: 'T2', src: 'shadow_hunter',
  bake: { outline: 0, flash: false },          // soft smoke parts: no painted outline; the hit flash is done on the composite
};

// ── the mimicked hero: a dark palette for the vector hero fallback (the painted puppet is stained on the composite) ──
const LOOKS = new WeakMap();
const FALLBACK = { build: 'normal', height: 1.0, hairStyle: 'ponytail', outfit: 'hunter', coat: 'long', weapon: { type: 'whip', style: 3 } };
function shadowLook(L) {
  let S = LOOKS.get(L);
  if (S) return S;
  S = {
    ...L, skin: '#2e2640', hair: '#0c0814', eyes: '#ff2a4a', eyeGlow: true,
    primary: '#16121e', secondary: '#3a0a30', trim: '#8a4ad8', pants: '#0e0a14', boots: '#08060c',
    armorColor: '#1c1826', armorTrim: '#9a4ae8', headColor: '#16121e', band: '#6a1a8a',
    cape: L.cape ? { ...L.cape, color: '#120e1a', color2: '#3a0a3a' } : null,
    scarf: L.scarf ? { ...L.scarf, color: '#4a0a4a' } : null,
    aura: { color: '#b060ff', type: 'dark' }, trailColor: '#b060ff',
    weapon: { ...(L.weapon || {}), color: '#2a2236', glow: true, element: 'dark', rarity: 4 },
  };
  LOOKS.set(L, S);
  return S;
}
/** AI_B.shadow state → the player-like object drawHero reads (same mapping as the vector renderer) */
function shadowPose(e, world, dead) {
  const pl = world?.player;
  const ps = e._ps || (e._ps = { cx: 0, bottom: 0, facing: 1, stats: {}, charging: 0, muzzleT: 0 });
  ps.anim = e.heroAnim ?? 'idle'; ps.animT = e.heroAnimT ?? e.animT; ps.move = e.mv ?? null; ps.moveT = e.mvT ?? 0; ps.atkSpeedMul = 1;
  ps.look = shadowLook(pl?.look || FALLBACK); ps.ch = pl?.ch;
  ps.vx = Math.abs(e.vx ?? 0); ps.vy = e.vy ?? 0; ps.onGround = e.onGround ?? true; ps.rig = e.rig || (e.rig = {}); ps.t = e.t ?? 0;
  ps.dashT = e.dashT ?? 0;
  if (dead) { ps.anim = 'hurt'; ps.animT = 0.06; ps.move = null; }
  return ps;
}

// ── one shared scratch canvas (every hunter composites itself completely before the next one draws) ──
const BWB = 120, BWF = 180, BT = 150, BB = 24;   // logical box around the feet: back / front (whip reach 162) / above / below
let SC = null, SG = null, RC = null, RG = null, UG = null, UGK = '';
function scratch(W, H) {
  if (!SC) { SC = K.mkCanvas(W, H); SG = SC.getContext('2d'); }
  if (SC.width < W || SC.height < H) { SC.width = Math.max(SC.width, W); SC.height = Math.max(SC.height, H); }
  return SG;
}
function rimCanvas(W, H) {
  if (!RC) { RC = K.mkCanvas(W, H); RG = RC.getContext('2d'); }
  if (RC.width < W || RC.height < H) { RC.width = Math.max(RC.width, W); RC.height = Math.max(RC.height, H); }
  return RG;
}
/** violet under-light rising from the ink pool (cached per scratch size) */
function underGrad(g, rs) {
  const k = rs.toFixed(2);
  if (UG && UGK === k) return UG;
  const y0 = (BT + 2) * rs, y1 = (BT - 44) * rs;
  UG = g.createLinearGradient(0, y0, 0, y1);
  UG.addColorStop(0, 'rgba(190,110,255,0.55)'); UG.addColorStop(0.4, 'rgba(130,60,230,0.2)'); UG.addColorStop(1, 'rgba(120,50,220,0)');
  UGK = k;
  return UG;
}
/**
 * render the hero pose into SC and stain it as a shadow. Full quality keeps the painted shading: the hue is replaced by
 * violet ('color' blend keeps the luminance), the figure is multiplied dark, then the alpha is restored from the clean
 * silhouette (blend fills also paint the empty box), and RC becomes the violet silhouette for the rim light. Low quality:
 * one flat source-atop stain, no rim. Returns [W, H] of the used region.
 */
const _wh = [0, 0];
function composite(e, world, flash, rs, dead = false, fine = true) {
  const W = Math.ceil((BWB + BWF) * rs), H = Math.ceil((BT + BB) * rs);
  const g = scratch(W, H);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W + 2, H + 2);
  g.setTransform(rs, 0, 0, rs, BWB * rs, BT * rs);
  drawHero(g, shadowPose(e, world, dead), world, { noFx: true });
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (flash) {
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, W, H);
  } else if (!fine) {
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(12,6,24,0.8)'; g.fillRect(0, 0, W, H);
    g.fillStyle = underGrad(g, rs); g.fillRect(0, (BT - 46) * rs, W, 50 * rs);
  } else {
    const r = rimCanvas(W, H);                    // clean silhouette (alpha mask; afterwards the violet rim)
    r.setTransform(1, 0, 0, 1, 0, 0); r.globalAlpha = 1; r.globalCompositeOperation = 'copy';
    r.drawImage(SC, 0, 0, W, H, 0, 0, W, H);
    r.globalCompositeOperation = 'source-over';
    g.globalCompositeOperation = 'color'; g.fillStyle = '#7a44c8'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(72,60,96)'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(RC, 0, 0, W, H, 0, 0, W, H);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(8,4,16,0.38)'; g.fillRect(0, 0, W, (BT - 40) * rs);      // the upper body sinks into the dark
    g.fillStyle = underGrad(g, rs); g.fillRect(0, (BT - 46) * rs, W, 50 * rs);
    r.globalCompositeOperation = 'source-in'; r.fillStyle = '#a45cff'; r.fillRect(0, 0, W, H);
    r.globalCompositeOperation = 'source-over';
  }
  g.globalCompositeOperation = 'source-over';
  _wh[0] = W; _wh[1] = H;
  return _wh;
}
function blitSC(ctx, img, W, H, x, y, a) {
  if (a <= 0.01) return;
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(img, 0, 0, W, H, x - BWB, y - BT, BWB + BWF, BT + BB);
  ctx.globalAlpha = ga;
}

const GS = 1.45;              // wraith scale (≈ 87×135 logical: a head taller than the hunter, hunched over it)
const _p = [0, 0];
/** ground offset under the feet in local units (null = over a pit / nothing near) */
function groundOff(e, world) {
  if (e.onGround !== false) return 0;
  if (!world) return 0;
  const gy = K.groundBelow(world, e.cx, e.bottom, 8);
  if (!Number.isFinite(gy)) return null;
  return (gy - e.bottom) / (e.scale || 1);
}
/** strike surge 0..1 from the mimicked move (rises over 0.1 s, holds, falls over the last 0.15 s) */
function surgeOf(e) {
  const mv = e.mv;
  if (!mv) return 0;
  const t = e.mvT ?? 0, dur = mv.dur ?? 0.4;
  return clamp(t / 0.1, 0, 1) * clamp((dur - t) / 0.15 + 0.25, 0, 1);
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0, L = K.lod();
  const m = ctx.getTransform();
  const rs = L === 0 ? 1 : clamp(Math.hypot(m.a, m.b), 1, 1.5);
  if (e.dying > 0) {
    if (world) { if (!e._pcorpse) { e._pcorpse = true; dissolve(ctx, e, world, rig, rs); } return; }
    // bestiary / gallery (no world): play the dissolve in place from the death clock
    const [W, H] = composite(e, null, false, rs, true, L > 0);
    K.begin(ctx, rig, 0);
    deathFrame(ctx, SC, W, H, K.deathK(e) * LIFE, rig, 0, null);
    K.end();
    return;
  }
  const flash = !!o.flash, hurt = K.hurtOf(e);
  const clock = K.clockOf(e, world);
  const fx = e._shFx || (e._shFx = new K.FxPool(L === 0 ? 10 : 22));
  const dt = fx.step(clock);
  // smoothed strike surge + dash / run weights (render state on the entity)
  const sg = surgeOf(e);
  e._shW = dt > 0 ? lerp(e._shW ?? 0, sg, sg > (e._shW ?? 0) ? clamp(dt * 22, 0, 1) : clamp(dt * 6, 0, 1)) : sg;   // frozen clock (bestiary) = exact
  const wk = e._shW;
  const dash = (e.dashT ?? 0) > 0 || e.heroAnim === 'dash';
  const run = !dash && e.heroAnim === 'run' && Math.abs(e.vx ?? 0) > 120;
  const gy = groundOff(e, world);
  const air = e.onGround === false;
  const [W, H] = composite(e, world, flash, rs, false, L > 0);
  const sx = hurt ? Math.sin(t * 90) * 1.6 * hurt - hurt * 2 : 0;

  K.begin(ctx, rig, 0);
  // ink pool + back light
  if (gy !== null && !flash) {
    const far = air ? clamp(1 - Math.abs(gy) / 160, 0.25, 1) : 1;
    K.put('pool', 'a', 0, gy + 0.5, 0, 1.3 * far + Math.sin(t * 2.1) * 0.03, 1.15 * far, 0.9 * far);
    K.glow(0, gy - 2, 30 * far, '#9a40ff', 0.28 * far);
  }
  if (!flash) K.glow(0, -46, 54, '#8a2aff', 0.18 + 0.12 * wk + 0.25 * hurt);
  // smoke wisps behind the legs (u = rise phase)
  const wy = gy ?? 0;
  if (!flash) for (let i = 0; i < (L === 0 ? 1 : 2); i++) wisp(t, i * 2, wy, 1, dash);
  // the wraith, faint while waiting, surging up over the hunter's shoulders while it strikes
  const ga = 0.13 + Math.sin(t * 1.7) * 0.03, wa = flash ? 0 : clamp(lerp(dash || run ? 0.06 : ga, 0.88, wk), 0, 1);
  const gx = -18 + wk * 8, gyy = wy - wk * 5 + Math.sin(t * 1.3) * 1.5, gr = wk * 0.2 + Math.sin(t * 1.1) * 0.02;
  if (wa > 0.02) K.put('grin', 'a', gx, gyy, gr, -GS * (1 + wk * 0.06), GS * (1 + wk * 0.06), wa);
  // afterimages (the composite itself, left behind)
  K.local();
  if (L > 0 && !flash) {
    if (dash) { blitSC(ctx, SC, W, H, -30, 0, 0.16); blitSC(ctx, SC, W, H, -15, 0, 0.34); }
    else if (run) blitSC(ctx, SC, W, H, -9, 0, 0.14);
  }
  // violet rim (silhouette nudged out behind the figure), then the shadow itself
  if (L > 0 && !flash) {
    const gco = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    const ra = 0.42 + 0.25 * wk + 0.4 * hurt;
    blitSC(ctx, RC, W, H, sx - 1.2, -1, ra); blitSC(ctx, RC, W, H, sx + 1.2, -1, ra * 0.8);
    ctx.globalCompositeOperation = gco;
  }
  blitSC(ctx, SC, W, H, sx, 0, flash ? 1 : 0.97);
  // front wisp curling over the ankles
  if (!flash && L > 0) wisp(t, 1, wy, 0.55, dash);
  // the wraith's eyes and grin burn through
  if (wa > 0.05) {
    const s = GS * (1 + wk * 0.06);
    K.pivotPos('grin', 'a', 'eyes', gx, gyy, gr, -s, s, _p);
    K.glow(_p[0], _p[1], 7 + 5 * wk, '#ff5af0', clamp(wa * 1.1, 0, 1), 0.3);
    K.pivotPos('grin', 'a', 'mouth', gx, gyy, gr, -s, s, _p);
    K.glow(_p[0], _p[1], 5 + 5 * wk, '#d070ff', clamp(wa * 0.9, 0, 1), 0.3);
  }
  if (hurt && !flash) K.glow(0, -50, 40, '#c080ff', 0.45 * hurt);
  // motes rising off the pool, smoke trail while dashing (world space)
  if (o.cam && dt > 0) {
    const f = e.facing < 0 ? -1 : 1, sc = e.scale || 1;
    const baseY = e.bottom + (gy ?? 0) * sc;
    if (gy !== null) for (let n = fx.rate(0, L === 0 ? 3 : 7, dt); n > 0; n--) fx.add(3, e.cx + K.frand(-14, 14) * sc, baseY - 2, K.frand(-8, 8), K.frand(-60, -30), K.frand(0.7, 1.2), K.frand(1.4, 2.4), '#c080ff');
    if (dash) for (let n = fx.rate(1, L === 0 ? 12 : 28, dt); n > 0; n--) fx.add(2, e.cx - f * K.frand(4, 16) * sc, e.bottom - K.frand(12, 70) * sc, -f * K.frand(10, 40), K.frand(-20, 5), K.frand(0.3, 0.5), K.frand(6, 10), '#1c0c2a');
  }
  if (o.cam && fx.n) { ctx.setTransform(o.cam); fx.draw(ctx); }
  K.end();
}

/** one smoke wisp: phase slot i (0..2), rising from the pool; a = alpha scale */
function wisp(t, i, wy, a, dash) {
  const u = (t * (dash ? 1.1 : 0.55) + i / 3) % 1;
  const x = (i - 1) * 11 + Math.sin(t * 1.3 + i * 2.1) * 3 - (dash ? u * 14 : 0);
  const s = 0.5 + u * 0.75;
  K.put(i % 2 ? 'smoke2' : 'smoke', 'a', x, wy - u * 24, Math.sin(t * 0.9 + i) * 0.14, i === 1 ? -s : s, s, Math.sin(u * Math.PI) * 0.62 * a);
}

// ── death: the silhouette tears into rising smoke bands, head first, as the wraith rises out of it ──
const LIFE = 1.15, NB = 9;
const BANDS = [];
for (let i = 0; i < NB; i++) BANDS.push({ ph: i * 1.7, dx: 0, sp: 0 });
function deathFrame(c, img, W, H, age, rig, x0, B) {
  const k = clamp(age / LIFE, 0, 1);
  if (k >= 1) return;
  const rsx = W / (BWB + BWF), band = (BT + BB) / NB;
  K.local();
  const ga = c.globalAlpha;
  for (let i = 0; i < NB; i++) {
    const b = B ? B[i] : BANDS[i];
    const d = (i / NB) * 0.4, u = clamp((age - d) / 0.62, 0, 1);    // top bands go first
    if (u >= 1) continue;
    const sy = Math.floor(band * i * rsx), sh = Math.ceil(band * rsx);
    c.globalAlpha = ga * (1 - u) * (1 - u * 0.3);
    const lift = -u * (40 + (b.sp || 20)) - u * u * 20, sw = Math.sin(b.ph + age * 7) * 6 * u + (b.dx || 0) * u;
    c.drawImage(img, 0, sy, W, sh, x0 - BWB * (1 + u * 0.35) + sw, -BT + band * i + lift, (BWB + BWF) * (1 + u * 0.35), band + u * 6);
  }
  c.globalAlpha = ga;
  // the wraith rises out of the tearing shadow, grins, fades
  const wa = Math.sin(clamp(k * 1.3, 0, 1) * Math.PI) * 0.9;
  if (wa > 0.02) {
    const y = -k * 36, s = GS * (1 + k * 0.25);
    K.put('grin', 'a', -10, y, -0.08 + k * 0.1, -s, s, wa);
    K.pivotPos('grin', 'a', 'eyes', -10, y, -0.08 + k * 0.1, -s, s, _p);
    K.glow(_p[0], _p[1], 10, '#ff5af0', wa, 0.3);
  }
  for (let i = 0; i < 3; i++) {
    const u = clamp(k * 1.2 - i * 0.12, 0, 1), s = 0.9 + u * 1.2;
    K.put(i % 2 ? 'smoke2' : 'smoke', 'a', (i - 1) * 16, -u * 30, (i - 1) * 0.2, i === 1 ? -s : s, s, Math.sin(u * Math.PI) * 0.7);
  }
  K.glow(0, -48, 60 * (1 - k * 0.6), '#9a40ff', 0.55 * (1 - k));
}
function dissolve(ctx, e, world, rig, rs) {
  if (!world.fx?.ghost) return;
  const [W, H] = composite(e, world, false, rs, true, K.lod() > 0);
  const img = K.mkCanvas(W, H);
  img.getContext('2d').drawImage(SC, 0, 0, W, H, 0, 0, W, H);
  const ox = e.cx, oy = e.bottom, f = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const t0 = world.time ?? 0;
  const B = [];
  for (let i = 0; i < NB; i++) B.push({ ph: K.frand(0, 6.28), dx: K.frand(-18, 18), sp: K.frand(10, 40) });
  const S = [];
  for (let i = 0; i < 14; i++) S.push({ x: K.frand(-16, 16), y: K.frand(-86, -6), vx: K.frand(-50, 50), vy: K.frand(-160, -40), s: K.frand(1.5, 3) });
  world.fx.ghost((c) => {
    const age = (world.time ?? t0) - t0;
    if (age >= LIFE) return;
    c.save();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.translate(ox, oy); c.scale(f * sc, sc);
    K.begin(c, rig, 0);
    deathFrame(c, img, W, H, age, rig, 0, B);
    // violet sparks flung up out of the smoke
    K.local();
    const k = age / LIFE, sp = K.puff('#c080ff', 0.2);
    c.globalCompositeOperation = 'lighter';
    for (const p of S) {
      c.globalAlpha = (1 - k) * 0.9;
      const r = p.s * (1 - k * 0.5);
      c.drawImage(sp, p.x + p.vx * age - r, p.y + p.vy * age - r, r * 2, r * 2);
    }
    K.end();
    c.restore();
  }, LIFE + 0.05, 'front');
}
