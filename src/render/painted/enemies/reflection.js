// T2 rig reuse: 비친 자 (reflection) — the player's own hero puppet (drawHero: painted cut-out puppet when the hero's
// assets are loaded, else the vector hero), re-rendered as a cracked mirror image: silvered glass tint, a moving mirror
// sheen, a spider-web crack pane (painted, from the shared glass sheet) over the chest and a few void-glass shards
// orbiting the body. Own atlas = only that glass (0 own Kling images, docs/art/ENEMY_PIPELINE.md §7).
// Driven by AI_B.shadow (mimics the player half a beat late): the pose comes from render/reflection_pose.js reflectionPose
// (e.heroAnim / e.mv / e.mvT / dashT), exactly like the vector fallback. hurt = white flash + crack flare; death = the image
// SHATTERS: the tinted silhouette splits into glass panes that fly apart and fall, with a shard burst.
import * as K from '../enemy_kit.js';
import { clamp } from '../../../core/math.js';
import { drawHero } from '../../hero.js';
import { reflectionPose } from '../../reflection_pose.js';

export const spec = {
  id: 'reflection', tier: 'T2', src: 'reflection',
  bake: { outline: 0.3, flash: false },
};

// one shared scratch canvas: every reflection composites itself completely before the next one draws
let SC = null, SG = null, SHEEN = null;
const BW = 80, BT = 128, BB = 18;          // logical box around the feet origin: ±BW wide, BT above, BB below
function scratch(W, H) {
  if (!SC) { SC = K.mkCanvas(W, H); SG = SC.getContext('2d'); }
  if (SC.width < W || SC.height < H) { SC.width = Math.max(SC.width, W); SC.height = Math.max(SC.height, H); }
  return SG;
}
/** diagonal mirror-sheen band (built once, drawn source-atop, sweeps across the figure) */
function sheen() {
  if (SHEEN) return SHEEN;
  SHEEN = K.mkCanvas(64, 256);
  const g = SHEEN.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(235,248,255,0.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  return SHEEN;
}
const SH = ['sh1', 'sh2', 'sh3', 'sh4'];
const _q = [0, 0];

/** composite the glass image of the hero into the scratch canvas; returns device scale rs */
function composite(ctx, e, world, flash, rig) {
  const m = ctx.getTransform();
  const rs = Math.min(2, Math.max(1, Math.hypot(m.a, m.b)));
  const W = Math.ceil(2 * BW * rs), H = Math.ceil((BT + BB) * rs);
  const g = scratch(W, H);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W + 2, H + 2);
  g.setTransform(rs, 0, 0, rs, BW * rs, BT * rs);
  const ps = reflectionPose(e, world);
  drawHero(g, ps, world, { noFx: true });
  // glass: silver-blue tint over the painted colours, then a sheen band sweeping diagonally
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = flash ? 'rgba(255,255,255,0.85)' : 'rgba(150,190,236,0.52)'; g.fillRect(0, 0, W, H);
  if (!flash) {
    g.fillStyle = 'rgba(20,34,70,0.18)'; g.fillRect(0, H * 0.55, W, H * 0.45);
    const t = e.t ?? 0, sx = ((t * 0.45) % 1.6 - 0.3) * W;
    g.setTransform(1, 0, -0.5, 1, 0, 0);
    g.drawImage(sheen(), sx, 0, 40 * rs, H);
    // painted crack web over the chest (atlas part, source-atop so it only marks the figure)
    g.setTransform(rs, 0, 0, rs, BW * rs, BT * rs);
    K.begin(g, rig, 0);
    K.put('web', 'c', 4, -54, 0.3, 0.85, 0.85, 0.9);
    K.end();
  }
  g.globalCompositeOperation = 'source-over';
  return rs;
}

export function draw(ctx, e, world, o, rig) {
  const t = e.t ?? 0;
  if (e.dying > 0 && world) {
    if (!e._pcorpse) { e._pcorpse = true; shatter(ctx, e, world, rig); }
    return;
  }
  const rs = composite(ctx, e, world, !!o.flash, rig);
  const W = Math.ceil(2 * BW * rs), H = Math.ceil((BT + BB) * rs);
  const hurt = K.hurtOf(e);
  K.begin(ctx, rig, 0);
  if (!o.flash) { K.glow(0, -44, 46, '#8fc8ff', 0.22 + 0.2 * hurt); K.shadow(18, 0.25); }
  K.local();
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * (o.flash ? 1 : 0.9);
  ctx.drawImage(SC, 0, 0, W, H, -BW, -BT, 2 * BW, BT + BB);
  ctx.globalAlpha = ga;
  // shards orbiting the waist; the crack's eye-light glints
  for (let i = 0; i < SH.length; i++) {
    const ph = t * (1.1 + i * 0.2) + i * 1.57, z = Math.sin(ph);
    K.put(SH[i], 'a', Math.cos(ph) * (18 + i * 2), -40 + z * 6 + Math.sin(t * 1.7 + i) * 4, ph * 2 + i, 0.9, 0.9, 0.55 + 0.35 * (z > 0 ? 1 : 0));
  }
  if (!o.flash) K.glow(8, -71, 4 + Math.sin(t * 6) + 3 * hurt, '#dff4ff', 0.6 + 0.3 * hurt);
  K.end();
}

/** death: the glass image breaks into panes that fall and fade + a burst of shards (outlives the entity) */
function shatter(ctx, e, world, rig) {
  if (!world.fx?.ghost) return;
  const rs = composite(ctx, e, world, false, rig);
  const W = Math.ceil(2 * BW * rs), H = Math.ceil((BT + BB) * rs);
  const img = K.mkCanvas(W, H);
  img.getContext('2d').drawImage(SC, 0, 0, W, H, 0, 0, W, H);
  const ox = e.cx, oy = e.bottom, fx = e.facing < 0 ? -1 : 1, sc = (e.scale || 1) * (rig.scale ?? 1);
  const t0 = world.time ?? 0, life = 0.9, N = 7;
  const P = [];
  for (let i = 0; i < N; i++) P.push({ vx: K.frand(-140, 140), vy: K.frand(-260, -60), vr: K.frand(-6, 6) });
  const S = [];
  for (let i = 0; i < 10; i++) S.push({ n: SH[i % 4], x: K.frand(-10, 10), y: K.frand(-70, -20), vx: K.frand(-220, 220), vy: K.frand(-320, -80), vr: K.frand(-12, 12) });
  world.fx.ghost((c) => {
    const age = (world.time ?? t0) - t0, k = clamp(age / life, 0, 1);
    if (k >= 1) return;
    c.save();
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.translate(ox, oy); c.scale(fx * sc, sc);
    const band = (BT + BB) / N;
    c.globalAlpha = (1 - k) * 0.9;
    for (let i = 0; i < N; i++) {
      const p = P[i], x = p.vx * age, y = p.vy * age + 700 * age * age;
      c.save();
      c.translate(x, -BT + band * (i + 0.5) + y); c.rotate(p.vr * age);
      c.drawImage(img, 0, Math.floor(band * i * rs), W, Math.ceil(band * rs), -BW, -band / 2, 2 * BW, band);
      c.restore();
    }
    K.begin(c, rig, 0);
    for (const s of S) K.put(s.n, 'a', s.x + s.vx * age, s.y + s.vy * age + 900 * age * age, s.vr * age, 1, 1, 1 - k);
    K.glow(0, -50, 50 * (1 - k), '#bfe8ff', 0.6 * (1 - k));
    K.end();
    c.restore();
  }, life + 0.1, 'front');
}
