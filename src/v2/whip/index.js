// v2 whip - public face of the whip Vigilia (the hero's weapon: a braided lash with a bell shard knotted to its tip). docs/v2/WHIP.md
//
//   createWhip(opts)     -> whip: set(mode, params) . update(dt, hand) . nodes . tip . sample(alpha, out) . warp() . reset()
//   WhipRenderer(gl)     -> draw(whip, env, alpha): the whole whip in one draw call (+ one for the shard's glow)
//   meshInfo / writeWhipMesh  for scenes that bring their own renderer (vertex layout in mesh.js)
//   whipFx(fx, feel)     -> default wiring of whip events to effects, sound and vibration (optional)
//   driveWhip(whip, hero, TUNE, pull)   hero state of the rules -> whip mode (call each tick before whip.update)
//   WHIP_SHAPES          authored tip paths, one per hero move id
export { createWhip, Whip, WHIP_TIERS } from './sim.js';
export { WHIP_SHAPES, WHIP_ALIAS, shapeOf } from './shapes.js';
export { meshInfo, writeWhipMesh, WHIP_VERT } from './mesh.js';
export { WhipRenderer } from './render.js';
export { whipFx, WHIP_TRAIL } from './fxlink.js';
export { driveWhip } from './drive.js';
