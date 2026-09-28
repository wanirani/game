// T3 painted puppet (knight-rig reuse): 죽음의 기사 (death_knight). The armor_knight's parts re-painted as a knight who sold
// his soul to Death (composition-keeping Kling edits → tools/painted/enemies/death_knight/parts.json reuses the knight's
// cut coordinates): blackened cuirass with bone spikes, a riveted skull and green soul gems, horned helm with soul fire in
// the visor, rerebrace/cuisse, vambrace+gauntlet, greave+sabaton, tattered black cape and a rune greatsword (squeezed at
// source by make_src.py). Damage variants by HP (dmg1 < 60 %, dmg2 < 30 %: cracks and chips in the plate).
// Driven by AI_B.swordsman (combo 3, guard, jumps): the shared two-handed swordsman layout of frozen_knight.js; three
// cuts (rising, upward, overhead chop whose impact launches the soul wave), counter after a guard, hurt, airborne,
// death collapse into black dust. Soul fire streams from the visor and the pauldrons; the runes flare on the wind-up.
import * as K from '../enemy_kit.js';
import { lerp } from '../../../core/math.js';
import { drawSwordKnight, toWorld } from './frozen_knight.js';

const DMG = { char: 0.8, cracks: 2, holes: 1, chips: 2, stain: '#14241a', crackMinLum: 40 };
export const spec = {
  id: 'death_knight', tier: 'T3', src: 'death_knight',
  scale: 1.2,        // the cut knight puppet stands 80 px; the logic rect is 96 px
  bake: {
    outline: 0.45, deep: { '*': 0.6 }, deepTint: 'rgb(110,130,120)', glow: { sword: '#52ff9a' },
    damage: { torso: DMG, helm: DMG, uarm: DMG, farm: DMG, shin: DMG, cape: { char: 1, holes: 3, cracks: 0 } },
  },
};

const _w = [0, 0];
const CFG = {
  eye: '#7affa8', trail: '#8affc0', glint: '#c8ffe0', dmg: true, pool: 30,
  glow: (t, s) => 0.2 + 0.1 * Math.sin(t * 5) + 0.45 * s.wind + 0.35 * s.strike * (s.trail ? s.trail[2] : 0),
  dust: { n: 10, w: 20, h: 22, col: '#2a2a30' },
  fx(e, L, s, pool, dt, sc) {
    const lo = K.lod() === 0 ? 0.5 : 1;
    // soul fire licking up out of the visor (more while winding up), embers off the rune blade
    toWorld(e, sc, L.eyeX, L.eyeY, _w);
    for (let n = pool.rate(0, (10 + 14 * s.wind) * lo, dt); n > 0; n--) pool.add(0, _w[0] + K.frand(-2, 2) * sc, _w[1] - K.frand(0, 3) * sc, K.frand(-12, 8), K.frand(-60, -30), K.frand(0.3, 0.6), K.frand(2.4, 4) * sc, '#58ff96');
    for (let n = pool.rate(1, (3 + 12 * s.wind) * lo, dt); n > 0; n--) {
      const u = K.frand(0.15, 0.95);
      toWorld(e, sc, lerp(L.gx, L.tipx, u), lerp(L.gy, L.tipy, u), _w);
      pool.add(3, _w[0], _w[1], K.frand(-18, 18), K.frand(-40, -5), K.frand(0.25, 0.5), K.frand(1.2, 2.4) * sc, '#9affc8');
    }
    // pauldron wisps
    toWorld(e, sc, L.snx - 2, L.sny - 6, _w);
    for (let n = pool.rate(2, 5 * lo, dt); n > 0; n--) pool.add(0, _w[0] + K.frand(-6, 6) * sc, _w[1], K.frand(-8, 8), K.frand(-40, -20), K.frand(0.4, 0.7), K.frand(2, 3.2) * sc, '#3cd878');
  },
};
export function draw(ctx, e, world, o, rig) { drawSwordKnight(ctx, e, world, o, rig, CFG); }
