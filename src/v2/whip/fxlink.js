// v2 whip - default wiring of the whip's events to the effects engine (src/v2/fx) and the feel table (src/v2/feel). docs/v2/WHIP.md §4
//   const link = whipFx(fx, feel);                   // fx and feel may be null (no effects on WebGL1, no sound)
//   const whip = createWhip({ onEvent: link.onEvent });
//   every frame after whip.update: link.update(whip)  // the trail behind the tip, the light on the shard
// The scene may ignore this file and handle onEvent itself.
import { E, RB, Q } from '../fx/engine.js';
import { SPR } from '../fx/sprites.js';

const S = {
  // the crack: a hard white flash, a ring of sparks flying out across the lash direction, a few embers
  flash: E({ sprite: SPR.GLOW, size: 40, grow: 1.9, life: 0.07, c0: [2.4, 2.2, 1.9, 0.8], c1: [1.6, 0.9, 0.4, 0], pri: 1, min: 1 }),
  core: E({ sprite: SPR.CORE, size: 16, grow: 2.2, life: 0.06, c0: [4, 4, 3.6, 1], c1: [3, 2, 1, 0], pri: 1, min: 1 }),
  ring: E({ sprite: SPR.STREAK, stretch: 2.2, n: 12, shape: 0, spread: 3.14, speed: [240, 520], grav: 500, drag: 3.2, life: [0.1, 0.22], size: [7, 12], grow: 0.4, c0: [3.4, 2.8, 1.6, 1], c1: [2.2, 0.7, 0.15, 0], cv: 0.25, floor: 2 }),
  ember: E({ sprite: SPR.STAR, n: 5, spread: 1.2, speed: [60, 190], grav: 380, drag: 1.6, life: [0.25, 0.5], size: [5, 9], spin: [-5, 5], c0: [3, 2.2, 0.9, 1], c1: [1.8, 0.5, 0.1, 0], floor: 2 }),
  // hook / wrap catch: cold sparks off the metal
  catch: E({ sprite: SPR.STREAK, stretch: 2, n: 9, spread: 1.6, speed: [160, 420], grav: 700, drag: 2.4, life: [0.12, 0.28], size: [6, 10], grow: 0.5, c0: [2.2, 2.8, 3.6, 1], c1: [0.6, 1.2, 2.6, 0], cv: 0.2, floor: 2 }),
  // the bell: slow golden motes rising from the shard
  chime: E({ sprite: SPR.STAR, n: 9, shape: 3, rad: 10, h: [0, 8], speed: [30, 110], vy: [30, 90], drag: 1.5, life: [0.5, 1.0], size: [7, 13], spin: [-3, 3], c0: [3.2, 2.5, 1.0, 1], c1: [2.0, 1.1, 0.3, 0] }),
  dust: E({ sprite: SPR.SMOKE, add: 0, n: 2, spread: 0.9, speed: [20, 70], vy: [10, 40], drag: 2.5, life: [0.25, 0.45], size: [10, 16], grow: 1.8, c0: [0.5, 0.46, 0.42, 0.35], c1: [0.4, 0.38, 0.36, 0] }),
};
export const WHIP_TRAIL = {
  lash: RB({ mode: 1, life: 0.13, width: 11, col: [1.9, 1.5, 0.95, 0.8] }),     // a thin warm streak behind the tip (a whip leaves a line, not a blade's sheet)
  heavy: RB({ mode: 1, life: 0.2, width: 17, col: [2.6, 1.5, 0.6, 0.9] }),
  line: RB({ mode: 1, life: 0.16, width: 9, col: [0.8, 1.3, 2.2, 0.7] }),   // the throw toward a ring
};
const C = { warm: [1.0, 0.82, 0.5], cold: [0.6, 0.8, 1.0], gold: [1.0, 0.8, 0.4], ringW: [2.4, 2.1, 1.6, 0.9], ringG: [2.6, 2.0, 0.8, 0.9], ringB: [1.2, 1.8, 2.8, 0.8] };
const STR = { L: 0.7, M: 1, H: 1.3, F: 1.6 };

export function whipFx(fx, feel, opts = {}) {
  const pos = { x: 0, y: 0, z: 0 };
  const L = {
    fx, feel, rb: -1, light: -1, px: 0, py: 0, pz: 0, has: false, weapon: opts.weapon ?? 'whip', sound: opts.sound !== false, last: '', count: 0,
    onEvent(name, e) {
      L.last = name; L.count++;
      const x = e.x, y = e.y, z = e.z, k = STR[e.strength] ?? 1, P = fx ? fx.particles : null;
      pos.x = x; pos.y = y; pos.z = z;
      if (name === 'crack') {
        if (P) {
          P.emit(S.flash, x, y, z, 0, 1, 0, k, 0); P.emit(S.core, x, y, z, 0, 1, 0, 1, 0);
          P.emit(S.ring, x, y, z, e.dx, e.dy, e.dz, e.kind === 'hit' ? 1.3 * k : 0.7 * k, fx.groundY);
          if (e.kind === 'hit') P.emit(S.ember, x, y, z, -e.dx, 0.6, -e.dz, k, fx.groundY);
          fx.quads.billboard(Q.RING, x, y, z, e.kind === 'hit' ? 46 * k : 26 * k, 0.16, C.ringW, 0.2, 1, 0.01);
          fx.light(x, y, z, 150 + 60 * k, C.warm, e.kind === 'hit' ? 1.0 : 0.6, 0.1, 0, 0);
        }
        // sound: a hit is voiced by the scene's strike (feel.hit with weapon 'whip'); the lash cracking in the air is ours
        if (feel && L.sound && e.kind !== 'hit') { try { feel.sound.host?.sfx?.('whip_crack', { volume: 0.5, rate: 1.1 }); } catch { /* no audio */ } if (feel.vibrate) feel.haptics?.play?.('tap'); }
      } else if (name === 'swing') {
        if (feel && L.sound && opts.swingSound) { try { feel.swing(L.weapon, e.strength, pos); } catch { /* no audio */ } }
      } else if (name === 'hook.catch' || name === 'wrap.catch') {
        if (P) { P.emit(S.catch, x, y, z, -e.dx, 0.4 - e.dy, -e.dz, 1, fx.groundY); P.emit(S.flash, x, y, z, 0, 1, 0, 0.8, 0); fx.quads.billboard(Q.RING, x, y, z, 34, 0.2, C.ringB, 0.2, 1, 0.01); fx.light(x, y, z, 170, C.cold, 0.8, 0.14, 0, 0); }
        if (feel && L.sound) { try { feel.hit(L.weapon, name === 'hook.catch' ? 'armor' : 'bone', 'L', 0, pos); } catch { /* no audio */ } }
      } else if (name === 'wrap.pull') {
        if (fx) fx.trauma?.(0.08, e.dx, 0, e.dz);
        if (feel && L.sound) { try { feel.swing(L.weapon, 'H', pos); } catch { /* no audio */ } }
      } else if (name === 'ring') {
        const long = e.kind === 'long';
        if (P) { P.emit(S.chime, x, y, z, 0, 1, 0, long ? 2 : 1, 0); fx.quads.billboard(Q.RING, x, y, z, long ? 120 : 64, long ? 0.6 : 0.34, C.ringG, 0.12, 1, 0.02); if (long) fx.quads.billboard(Q.RING, x, y, z, 60, 0.4, C.ringG, 0.2, 1, 0.02); fx.light(x, y, z, long ? 320 : 200, C.gold, long ? 1.2 : 0.8, long ? 0.7 : 0.3, 0, 0); }
        if (feel && L.sound) { try { feel.bell(long ? 'toll' : 'still') ?? feel.play('bell.echo', pos); } catch { /* no audio */ } }
      } else if (name === 'drag') {
        if (P && fx.tier !== 'low') P.emit(S.dust, x, y + 2, z, 0, 1, 0, 1, y);
      }
    },
    /** every frame (after whip.update): trail ribbon + a small light riding the shard when it glows */
    update(whip) {
      if (!fx) return;
      const R = fx.ribbons, t = whip.tip;
      const on = whip.trail > 0 && t.speed > 420;
      if (on && L.rb < 0) L.rb = R.start(whip.mode === 'swing' ? (whip.sw.str === 'F' || whip.sw.str === 'H' ? WHIP_TRAIL.heavy : WHIP_TRAIL.lash) : whip.mode === 'spin' ? WHIP_TRAIL.lash : WHIP_TRAIL.line);
      if (L.rb >= 0) {
        if (!on) { R.end(L.rb); L.rb = -1; }
        else {   // two points a tick: the tip moves up to 55 px between ticks, the point between is taken on the arc around the hand
          const r = whip.root, ax = L.px - r.x, ay = L.py - r.y, az = L.pz - r.z, bx = t.x - r.x, by = t.y - r.y, bz = t.z - r.z;
          if (L.has) { let mx = ax + bx, my = ay + by, mz = az + bz; const ml = Math.hypot(mx, my, mz) || 1, rad = (Math.hypot(ax, ay, az) + Math.hypot(bx, by, bz)) * 0.5 / ml; R.push(L.rb, r.x + mx * rad, r.y + my * rad, r.z + mz * rad, 0, 0, 0); }
          R.push(L.rb, t.x, t.y, t.z, 0, 0, 0);
        }
      }
      L.px = t.x; L.py = t.y; L.pz = t.z; L.has = true;
    },
    /** area change / respawn */
    clear() { if (fx && L.rb >= 0) fx.ribbons.end(L.rb); L.rb = -1; L.has = false; },
  };
  return L;
}
