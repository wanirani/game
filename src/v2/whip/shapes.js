// v2 whip - authored tip paths, one per hero move. docs/v2/WHIP.md
// Every attack is drawn the same way each time: the tip follows the keys below, the lash between hand and tip is
// laid on a curve of exactly the lash length, and the physics only adds lag, follow-through and settle.
//
// Key = [s, f, r, y, w, bf, br, by]
//   s        phase: -1..0 wind-up (move start -> hit window opens), 0..1 the hit window, 1..2 recovery (window closes -> move end)
//   f r y    tip position in the hero frame, px: f forward, r to the hero's right, y above the feet
//            (frame 'aim': f is a fraction of the way from the chest to the target, r and y are px offsets)
//   w        how hard the lash is held to the authored curve this tick (0 = free physics, 1 = exactly the curve)
//   b*       where the slack of the lash bulges to (hero frame direction; length does not matter)
// peak = the phase where the lash is fully extended and cracks. len = lash length limits as a factor of the base length.
// nominal = timing and hit shape used only when the rules table (src/v2/play/moves.js) has no move of that id.

const K = (rows) => { const a = new Float32Array(rows.length * 8); rows.forEach((r, i) => a.set(r, i * 8)); return a; };
// The rules land a hit on the first tick of the hit window, so the lash has to ARRIVE as the window opens: the keys below are written
// with the full extension at phase pk (easy to read: wind-up, strike, follow-through) and S() squeezes them so that the extension falls at
// PEAK, just inside the window. What was "the strike" plays in the last part of the wind-up, the follow-through fills the window.
export const PEAK = 0.08;
const S = (pk, rows) => K(rows.map((r) => { const s = r[0], q = s <= pk ? -1 + ((s + 1) * (1 + PEAK)) / (pk + 1) : s <= 1 ? PEAK + ((s - pk) * (0.62 - PEAK)) / (1 - pk) : 0.62 + (s - 1) * 1.38; return [q, ...r.slice(1)]; }));

export const WHIP_SHAPES = {
  // combo 1: flat cut from the right, across the front, to the left (clip atk1)
  c1: { peak: PEAK, ev: 'crack', keys: S(0.6, [
    [-1.0, -34, 30, 36, 0.35, -1, 0, -1],
    [-0.55, -66, 48, 74, 0.6, -1, 0.3, 0.6],
    [-0.12, -44, 86, 66, 0.75, -1, 0.4, 0.5],
    [0.15, 18, 96, 60, 0.9, -1, 0.6, 0.3],
    [0.42, 78, 44, 57, 0.95, -0.6, 1, 0.2],
    [0.6, 100, 6, 54, 1.0, 0, 1, 0.2],
    [0.8, 93, -30, 52, 0.95, 0.3, 1, 0],
    [1.0, 64, -62, 46, 0.6, 0.6, 1, -0.3],
    [1.4, 22, -58, 18, 0.12, 0.5, 0.5, -1],
    [2.0, -4, -34, 5, 0.0, 0, 0, -1],
  ]) },
  // combo 2: backhand from high left, down across the front, to the low right (clip atk2)
  c2: { peak: PEAK, ev: 'crack', keys: S(0.5, [
    [-1.0, 22, -50, 48, 0.35, -1, 0, -1],
    [-0.55, -30, -70, 96, 0.6, -1, -0.3, 0.8],
    [-0.12, -20, -86, 122, 0.75, -1, -0.4, 0.8],
    [0.2, 46, -70, 110, 0.9, -1, -0.6, 0.6],
    [0.5, 104, -8, 70, 1.0, -0.2, -1, 0.5],
    [0.75, 95, 30, 48, 0.95, 0.3, -1, 0.4],
    [1.0, 60, 64, 30, 0.6, 0.6, -1, 0],
    [1.4, 12, 58, 8, 0.12, 0.5, -0.5, -1],
    [2.0, -14, 34, 4, 0.0, 0, 0, -1],
  ]) },
  // combo 3: the wide one. Up and over the head, then a full low circle from the left, through the front, to the right (clip atk3)
  c3: { peak: PEAK, ev: 'crack', keys: S(0.5, [
    [-1.0, -10, 40, 22, 0.35, -1, 0, -1],
    [-0.6, -50, 12, 122, 0.6, -1, 0, 0.5],
    [-0.25, -22, -60, 166, 0.75, -0.5, 1, 0.5],
    [0.0, -62, -100, 108, 0.9, 0.3, 1, 0.6],
    [0.25, 40, -118, 60, 0.97, -1, 0.2, 0.3],
    [0.5, 124, -10, 40, 1.0, -0.4, -1, 0.3],
    [0.75, 50, 115, 38, 0.97, 0.6, -1, 0.3],
    [1.0, -70, 100, 40, 0.7, 1, 0.2, 0.3],
    [1.3, -84, 22, 30, 0.25, 0.6, 1, -0.4],
    [2.0, -30, -18, 5, 0.0, 0, 0, -1],
  ]) },
  // sweep after a roll: scrape the ground from the low right and rip upward through the front (clip launcher)
  sweep: { peak: PEAK, ev: 'crack', keys: S(0.6, [
    [-1.0, -30, 30, 30, 0.35, -1, 0, -1],
    [-0.4, -62, 52, 16, 0.6, -1, 0.3, 0.2],
    [0.0, 10, 86, 12, 0.9, -1, 0.5, 0.2],
    [0.35, 84, 46, 22, 0.95, -0.7, 1, 0],
    [0.6, 112, 0, 56, 1.0, -0.2, 0.6, -1],
    [0.85, 96, -20, 112, 0.95, 0.2, 0.3, -1],
    [1.0, 70, -26, 134, 0.6, 0.5, 0.2, -1],
    [1.4, -8, -20, 150, 0.15, 1, 0, -0.4],
    [2.0, -40, 0, 40, 0.0, 0, 0, -1],
  ]) },
  // hold-attack (rules id 'whip'): the long lash thrown straight ahead to the far end of its hit box; what it catches is then wound and pulled (mode 'wrap')
  whip: { peak: PEAK, ev: 'crack', len: [0.7, 2.9], nominal: { dur: 0.62, hit: [0.12, 0.26], box: { f0: 10, f1: 250, side: 40, y0: 0, y1: 150 } }, keys: S(0.6, [
    [-1.0, -40, 30, 150, 0.5, -1, 0.3, 0.3],
    [-0.5, -72, 22, 122, 0.7, -1, 0.3, 0.4],
    [-0.1, -52, 12, 92, 0.85, -1, 0.2, 0.6],
    [0.25, 92, 4, 98, 0.95, -1, 0, 0.8],
    [0.6, 240, 0, 62, 1.0, -1, 0, 0.6],
    [0.8, 238, -2, 56, 1.0, -1, 0, 0.4],
    [1.0, 222, -4, 44, 0.8, -1, 0, 0.2],
    [1.5, 120, -8, 8, 0.2, -1, 0, 0],
    [2.0, 40, -6, 4, 0.0, 0, 0, -1],
  ]) },
  // launcher: straight up the middle (rules may add it later)
  launcher: { peak: PEAK, ev: 'crack', nominal: { dur: 0.52, hit: [0.14, 0.28], box: { f0: -10, f1: 104, side: 40, y0: 0, y1: 190 } }, keys: S(0.5, [
    [-1.0, -30, 24, 26, 0.35, -1, 0, -1],
    [-0.4, -64, 20, 10, 0.6, -1, 0, 0.3],
    [0.0, 30, 14, 8, 0.9, -1, 0, 0.3],
    [0.5, 92, 0, 70, 1.0, -0.6, 0, -1],
    [0.8, 78, -4, 134, 0.95, -0.2, 0, -1],
    [1.0, 52, -6, 172, 0.6, 0.4, 0, -1],
    [1.4, -20, -6, 168, 0.15, 1, 0, 0],
    [2.0, -46, 0, 50, 0.0, 0, 0, -1],
  ]) },
  // plunge: over the head while still rising, then held straight down ahead of the fall; the landing drives it along the ground.
  // The window stays open until the hero lands, so the phase is driven by set('swing', { landT }) - see sim.js
  plunge: { peak: 0.5, ev: 'crack', hold: 0.5, keys: K([
    [-1.0, -24, 20, 150, 0.5, -1, 0, 0.5],
    [-0.3, 6, 14, 176, 0.75, -1, 0, 0.6],
    [0.0, 40, 8, 150, 0.9, -1, 0, 0.8],
    [0.25, 66, 2, 60, 0.97, -0.6, 0, 1],
    [0.5, 58, 0, -34, 1.0, -1, 0, 0.4],
    [0.75, 74, 0, 2, 0.95, -1, 0, 0.6],
    [1.0, 86, -4, 3, 0.7, -1, 0, 0.8],
    [1.4, 52, -8, 3, 0.12, -1, 0, 0.5],
    [2.0, 20, -6, 3, 0.0, 0, 0, -1],
  ]) },
  // charged strike: one slow circle over the head while charging, then a long overhead slam into the ground ahead
  charge: { peak: PEAK, ev: 'crack', len: [0.9, 1.5], nominal: { dur: 0.95, hit: [0.52, 0.68], box: { f0: -10, f1: 152, side: 42, y0: 0, y1: 150 } }, keys: S(0.55, [
    [-1.0, -30, 30, 30, 0.35, -1, 0, -1],
    [-0.8, -70, 30, 120, 0.6, 0, 1, 0.3],
    [-0.6, -30, -76, 164, 0.7, 1, 0.5, 0.2],
    [-0.4, 64, -40, 172, 0.7, 0.5, -1, 0.2],
    [-0.2, 30, 70, 176, 0.75, -1, -0.5, 0.2],
    [0.0, -66, 26, 168, 0.9, -0.5, 1, 0.4],
    [0.3, 40, 6, 190, 0.97, -1, 0, 0.6],
    [0.55, 142, 0, 20, 1.0, -0.5, 0, 1],
    [0.8, 146, -4, 4, 0.95, -1, 0, 0.6],
    [1.0, 134, -8, 3, 0.7, -1, 0, 0.6],
    [1.5, 70, -10, 3, 0.1, -1, 0, 0.3],
    [2.0, 30, -8, 3, 0.0, 0, 0, -1],
  ]) },
  // far bell strike: thrown at a distant point (frame 'aim': f = fraction of the way from the chest to the target)
  far: { peak: PEAK, ev: 'crack', frame: 'aim', len: [0.6, 4.2], nominal: { dur: 0.6, hit: [0.2, 0.34], reach: 380 }, keys: S(0.6, [
    [-1.0, -0.1, 24, -30, 0.4, -1, 0, -1],
    [-0.5, -0.32, 34, 40, 0.65, -1, 0.3, 0.6],
    [-0.1, -0.2, 26, 78, 0.8, -1, 0.3, 0.6],
    [0.2, 0.35, 10, 46, 0.95, -1, 0.2, 0.8],
    [0.6, 1.0, 0, 0, 1.0, -1, 0, 0.6],
    [0.8, 0.97, -2, -3, 1.0, -1, 0, 0.4],
    [1.0, 0.86, -6, -10, 0.8, -1, 0, 0.3],
    [1.5, 0.4, -10, -44, 0.25, -1, 0, 0],
    [2.0, 0.1, -8, -66, 0.0, 0, 0, -1],
  ]) },
  // bell, short: a wrist flick that snaps the shard up in front of the face
  ring_short: { peak: 0.5, ev: 'ring', kind: 'short', nominal: { dur: 0.5, hit: [0.16, 0.27] }, keys: K([
    [-1.0, 0, 26, 26, 0.35, -1, 0, -1],
    [-0.4, -26, 30, 40, 0.6, -1, 0, -0.4],
    [0.0, 30, 22, 70, 0.9, -1, 0.3, -0.6],
    [0.5, 54, 2, 164, 1.0, 1, 0, -0.3],
    [1.0, 46, -4, 158, 0.9, 1, 0, -0.5],
    [1.4, 40, -4, 110, 0.3, 1, 0, -1],
    [2.0, 20, 0, 20, 0.0, 0, 0, -1],
  ]) },
  // bell, long: one slow halo over the head, then the shard is lifted high and held while it rings
  ring_long: { peak: 0.5, ev: 'ring', kind: 'long', nominal: { dur: 1.5, hit: [0.72, 1.1] }, keys: K([
    [-1.0, 0, 26, 26, 0.35, -1, 0, -1],
    [-0.8, -50, 40, 120, 0.6, 0, 1, 0.2],
    [-0.6, -44, -64, 168, 0.75, 1, 0.5, 0.2],
    [-0.4, 60, -50, 178, 0.75, 0.5, -1, 0.2],
    [-0.2, 56, 60, 180, 0.75, -1, -0.5, 0.2],
    [0.0, -30, 44, 186, 0.9, -0.5, 1, 0.3],
    [0.5, 14, 0, 196, 1.0, -1, 0, -0.2],
    [1.0, 16, 0, 192, 0.95, -1, 0, -0.2],
    [1.5, 30, 6, 120, 0.3, -1, 0, -1],
    [2.0, 20, 8, 20, 0.0, 0, 0, -1],
  ]) },
};

/** move ids the rules may use for the same shape */
export const WHIP_ALIAS = {
  atk1: 'c1', atk2: 'c2', atk3: 'c3', combo1: 'c1', combo2: 'c2', combo3: 'c3', roll_sweep: 'sweep', uppercut: 'launcher', launch: 'launcher',
  charged: 'charge', heavy: 'charge', wrap: 'whip', lash: 'whip', bell_far: 'far', farbell: 'far', far_bell: 'far', bell: 'ring_short', bell_short: 'ring_short', bell_long: 'ring_long', ring: 'ring_short',
};

export function shapeOf(id) { return WHIP_SHAPES[id] ?? WHIP_SHAPES[WHIP_ALIAS[id]] ?? WHIP_SHAPES.c1; }
