// v2 whip - hero state (src/v2/play rules) -> whip mode, once per tick before whip.update. docs/v2/WHIP.md §5
// Reads only: act, actT, actDone, charging, charge, move, moveT, dirX, dirZ, plungeLand, whipX/Y/Z, dead. Allocates nothing.
const P = { move: '', t: 0, dirX: 1, dirZ: 0, hit: null, dur: 0, landT: null, x: null, y: 0, z: 0, r: 14, phase: '', kind: '', style: 'coil', throwT: 0.16, level: 0 };
const HIT = [0, 0];

/**
 * whip: createWhip(). h: sim.hero. T: TUNE (src/v2/play). pull: null, or the thing the lash has caught and is pulling
 * ({ x, y, z, r } - the scene keeps it from hooks.pull until both pullT run out; y = the height the lash winds at).
 */
export function driveWhip(whip, h, T, pull) {
  P.dirX = h.dirX ?? h.facing ?? 1; P.dirZ = h.dirZ ?? 0; P.hit = null; P.dur = 0; P.landT = null; P.x = null;
  if (h.dead) { P.style = 'hang'; whip.set('rest', P); return; }
  if (pull) { P.x = pull.x; P.y = pull.y; P.z = pull.z; P.r = pull.r ?? 14; P.phase = 'pull'; P.t = null; whip.set('wrap', P); return; }
  const a = h.act;
  if (a === 'hook') { P.x = h.whipX; P.y = h.whipY; P.z = h.whipZ; P.phase = 'throw'; P.t = h.actT; P.throwT = (T && T.hookThrow) || 0.16; whip.set('hook', P); return; }
  if (a === 'echo') { const at = (T && T.echoAt) || 0.2; HIT[0] = Math.max(0.02, at - 0.07); HIT[1] = at + 0.07; P.hit = HIT; P.dur = (T && T.echoT) || 0.52; P.kind = 'short'; P.t = h.actT; whip.set('ring', P); return; }
  if (a === 'ring') { const rt = (T && T.ringT) || 0.8; HIT[0] = rt - 0.08; HIT[1] = rt + 0.3; P.hit = HIT; P.dur = rt + 0.5; P.kind = 'long'; P.t = h.actDone ? rt + h.actT : Math.min(h.actT, rt - 0.001); whip.set('ring', P); return; }
  if (h.charging) { P.level = h.charge ?? 0.5; whip.set('spin', P); return; }
  const mv = h.move;
  if (mv) { P.move = mv.id; P.t = h.moveT; P.hit = mv.hit; P.dur = mv.dur; P.landT = h.plungeLand ?? null; whip.set('swing', P); return; }
  P.style = 'coil'; whip.set('rest', P);
}
