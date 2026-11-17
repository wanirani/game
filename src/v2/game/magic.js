// v2g magic — enemy shots as 3D effects driven by the rules (the Sim owns the shot; the effect follows it).
// Per shot: a camera-facing ribbon tail, a glow core, a moving point light and drip particles; a burst on impact.
// Handles live on the shot object as numbers (_rb, _bb, _lt, _lp) so nothing is allocated per frame.
import { E, RB, Q } from '../fx/engine.js';
import { SPR } from '../fx/sprites.js';

const EL = {
  shadow: {
    trail: RB({ mode: 1, life: 0.3, width: 26, col: [1.5, 0.5, 2.8, 0.9] }), glow: [1.1, 0.42, 2.0, 0.85], core: [2.2, 1.7, 2.6, 1], light: [0.75, 0.35, 1.5], sound: 'blood',
    drip: E({ sprite: SPR.EMBER, shape: 1, speed: [10, 70], vy: [-20, 40], drag: 1.5, life: [0.25, 0.5], size: [5, 10], c0: [1.9, 0.9, 3.2, 1], c1: [0.6, 0.1, 1.4, 0] }),
    burst: E({ sprite: SPR.STREAK, stretch: 2, n: 14, shape: 1, speed: [160, 460], vy: [40, 240], grav: 700, drag: 1.6, life: [0.22, 0.5], size: [7, 13], c0: [2.4, 1.3, 3.4, 1], c1: [0.8, 0.1, 1.6, 0] }),
    mist: E({ sprite: SPR.SMOKE, add: 0, n: 5, shape: 1, speed: [30, 120], vy: [10, 70], drag: 2.4, life: [0.5, 0.9], size: [46, 74], grow: 1.8, c0: [0.16, 0.05, 0.24, 0.5], c1: [0.2, 0.05, 0.3, 0], fadeIn: 0.1 }),
    ring: [1.4, 0.8, 2.6, 0.9],
  },
  blood: {
    trail: RB({ mode: 1, life: 0.3, width: 24, col: [1.6, 0.06, 0.12, 0.9] }), glow: [1.6, 0.12, 0.16, 0.8], core: [2.4, 0.9, 0.8, 1], light: [1.4, 0.15, 0.15], sound: 'blood',
    drip: E({ sprite: SPR.DROP, stretch: 1.2, add: 0, shape: 1, speed: [20, 85], grav: 700, life: [0.3, 0.52], size: [8, 13], c0: [0.8, 0.04, 0.09, 1], c1: [0.36, 0, 0.03, 0.7], floor: 1 }),
    burst: E({ sprite: SPR.DROP, stretch: 1.6, add: 0, n: 16, shape: 1, speed: [180, 480], vy: [80, 280], grav: 1300, drag: 0.6, life: [0.5, 0.9], size: [9, 17], c0: [0.9, 0.05, 0.1, 1], c1: [0.4, 0, 0.04, 0.8], floor: 1 }),
    mist: E({ sprite: SPR.SMOKE, add: 0, n: 5, shape: 1, speed: [40, 140], vy: [10, 75], drag: 2.4, life: [0.6, 1.0], size: [50, 80], grow: 1.8, c0: [0.13, 0.02, 0.11, 0.5], c1: [0.2, 0.03, 0.22, 0], fadeIn: 0.1 }),
    ring: [2.2, 0.25, 0.2, 0.9],
  },
  fire: {
    trail: RB({ mode: 1, life: 0.2, width: 30, col: [2.6, 1, 0.2, 0.9] }), glow: [2.2, 0.9, 0.2, 0.85], core: [3, 2.2, 1.2, 1], light: [1.6, 0.7, 0.2], sound: 'fire',
    drip: E({ sprite: SPR.EMBER, shape: 1, speed: [20, 120], vy: [20, 120], grav: 300, drag: 1.2, life: [0.3, 0.6], size: [5, 9], c0: [3.4, 1.7, 0.4, 1], c1: [1.8, 0.3, 0.05, 0] }),
    burst: E({ sprite: SPR.EMBER, n: 16, shape: 1, speed: [150, 440], vy: [100, 320], grav: 600, drag: 1.2, life: [0.4, 0.9], size: [5, 9], c0: [3.4, 1.7, 0.4, 1], c1: [1.8, 0.3, 0.05, 0], floor: 2 }),
    mist: E({ sprite: SPR.SMOKE, add: 0, n: 5, shape: 1, speed: [40, 140], vy: [30, 110], drag: 2.2, life: [0.5, 0.9], size: [50, 80], grow: 1.8, c0: [0.12, 0.1, 0.1, 0.5], c1: [0.2, 0.18, 0.18, 0], fadeIn: 0.1 }),
    ring: [2.2, 1.6, 0.5, 0.9],
  },
  ice: {
    trail: RB({ mode: 1, life: 0.18, width: 16, col: [1, 1.9, 2.8, 0.9] }), glow: [0.6, 1.5, 2.2, 0.85], core: [2.2, 2.8, 3.2, 1], light: [0.4, 0.9, 1.6], sound: 'ice',
    drip: E({ sprite: SPR.SNOW, shape: 1, speed: [10, 70], vy: [-30, 30], drag: 1.5, life: [0.3, 0.6], size: [5, 9], c0: [1.6, 2.4, 3, 1], c1: [0.6, 1.2, 2, 0] }),
    burst: E({ sprite: SPR.SHARD, n: 14, shape: 1, speed: [160, 420], vy: [60, 260], grav: 1100, drag: 0.8, life: [0.35, 0.7], size: [7, 13], c0: [1.8, 2.6, 3.2, 1], c1: [0.7, 1.3, 2.2, 0], floor: 1 }),
    mist: E({ sprite: SPR.SMOKE, add: 0, n: 5, shape: 1, speed: [30, 120], vy: [10, 60], drag: 2.4, life: [0.5, 0.9], size: [46, 74], grow: 1.8, c0: [0.5, 0.62, 0.75, 0.35], c1: [0.6, 0.7, 0.85, 0], fadeIn: 0.1 }),
    ring: [0.6, 1.6, 2.2, 0.9],
  },
};
EL.holy = EL.fire; EL.lightning = EL.ice;
export const elementOf = (s, kindEl) => EL[s.element ?? kindEl ?? 'shadow'] ?? EL.shadow;

/** start following a new shot */
export function shotAttach(fx, s, el) {
  s._rb = fx.ribbons.start(el.trail);
  s._bb = fx.quads.billboard(Q.GLOW, s.x, s.y, s.z, 44, 30, el.glow, 1, 1, 0.05);
  s._bc = fx.quads.billboard(Q.GLOW, s.x, s.y, s.z, 15, 30, el.core, 1, 1, 0.05);
  s._lt = fx.light(s.x, s.y, s.z, 230, el.light, 1.1, 30, 0.2, 1);
}
/** every tick while the shot lives (x, y, z = its position this tick; gy = ground height below it; dt = effect dt) */
export function shotMove(fx, s, el, gy, dt) {
  if (s._rb >= 0) fx.ribbons.push(s._rb, s.x, s.y, s.z, 0, 0, 0);
  fx.quads.move(s._bb, s.x, s.y, s.z); fx.quads.move(s._bc, s.x, s.y, s.z); fx.lights.move(s._lt, s.x, s.y, s.z);
  fx.particles.emit(el.drip, s.x, s.y, s.z, 0, 1, 0, 40 * dt, gy);
}
/** stop following (the shot is gone) */
export function shotDetach(fx, s) {
  if (s._rb >= 0) fx.ribbons.end(s._rb);
  fx.quads.kill(s._bb); fx.quads.kill(s._bc); fx.lights.kill(s._lt);
  s._rb = s._bb = s._bc = s._lt = -1;
}
/** burst where a shot hit something (or was cut) */
export function shotImpact(fx, el, x, y, z, gy) {
  const P = fx.particles;
  P.emit(el.burst, x, y, z, 0, 1, 0, 1, gy); P.emit(el.mist, x, y, z, 0, 1, 0, 1, gy);
  fx.quads.billboard(Q.RING, x, y, z, 84, 0.26, el.ring, 0.2, 1, 0);
  fx.quads.billboard(Q.GLOW, x, y, z, 120, 0.2, el.glow, 1, 1.5, 0);
  fx.quads.ground(Q.RING, x, gy, z, 110, 110, 0, 0.4, el.ring, 0.2, 1, 0, 0, 1, 0, 0, 0);
  fx.light(x, y, z, 330, el.light, 1.4, 0.35, 0, 0);
}
