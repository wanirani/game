// Painted-enemy gallery: every reference enemy in every state, painted vs vector (A/B), over a stage backdrop.
// Open tools/painted/enemies/gallery.html?ids=skeleton,bat[&t=1.2 freeze][&vec=1][&zoom=2][&bg=bg/s02_graveyard]
import { drawEnemy } from '../../../src/render/enemies.js';
import { ENEMIES } from '../../../src/data/enemies.js';
import { rigStats } from '../../../src/render/painted/enemy_kit.js';
import { game } from '../../../src/core/game.js';

const Q = new URLSearchParams(location.search);
const W = (d) => d.aiParams?.windup ?? 0.45;
// state presets per enemy: [label, fields]
export const CASES = {
  skeleton: (d) => [
    ['idle', { anim: 'idle' }], ['walk a', { anim: 'walk', tOff: 0.0 }], ['walk b', { anim: 'walk', tOff: 0.17 }],
    ['wind-up', { anim: 'attack', animT: W(d) * 0.7 }], ['strike', { anim: 'attack', animT: W(d) + 0.05 }], ['follow', { anim: 'attack', animT: W(d) + 0.2 }],
    ['hurt', { anim: 'walk', flashT: 0.11, stun: 0.2 }], ['stun', { anim: 'idle', stun: 0.18 }], ['air', { anim: 'idle', onGround: false }], ['dying', { anim: 'idle', dying: 0.15 }],
  ],
  armor_knight: (d) => CASES.skeleton(d),
  bat: () => [
    ['hang', { anim: 'hang', state: 'hang' }], ['fly a', { anim: 'fly', state: 'fly', tOff: 0 }], ['fly b', { anim: 'fly', state: 'fly', tOff: 0.03 }], ['fly c', { anim: 'fly', state: 'fly', tOff: 0.06 }],
    ['drop', { anim: 'fly', state: 'drop', stateT: 0.15 }], ['dive', { anim: 'fly', state: 'dive', vx: 200, vy: 180 }], ['hover', { anim: 'fly', state: 'hover' }],
    ['hurt', { anim: 'fly', state: 'fly', flashT: 0.11, stun: 0.2 }], ['dying', { anim: 'fly', dying: 0.15 }],
  ],
  ghost: () => [
    ['float a', { anim: 'fly', tOff: 0 }], ['float b', { anim: 'fly', tOff: 0.6 }], ['move', { anim: 'fly', vx: 60, vy: -10 }], ['lunge', { anim: 'fly', vx: 70, near: 1 }],
    ['hurt', { anim: 'fly', flashT: 0.11, stun: 0.2 }], ['dying', { anim: 'fly', dying: 0.2 }],
  ],
  gravedigger: (d) => [
    ['idle', { anim: 'idle' }], ['walk a', { anim: 'walk', tOff: 0 }], ['walk b', { anim: 'walk', tOff: 0.26 }],
    ['slam wind', { anim: 'slam', state: 'slam', animT: 0.5 }], ['slam hit', { anim: 'slam', state: 'slam', animT: 0.75 }], ['slam after', { anim: 'slam', state: 'slam', animT: 1.0 }],
    ['fling wind', { anim: 'fling', state: 'fling', animT: 0.35 }], ['fling out', { anim: 'fling', state: 'fling', animT: 0.58 }],
    ['hurt', { anim: 'walk', flashT: 0.11, stun: 0.2 }], ['dmg 50%', { anim: 'idle', hpK: 0.5 }], ['dmg 20%', { anim: 'idle', hpK: 0.2 }], ['dying', { anim: 'idle', dying: 0.15 }],
  ],
};

const ids = (Q.get('ids') ?? 'skeleton').split(',');
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const vecBox = document.getElementById('vec'), zoomR = document.getElementById('zoom');
if (Q.get('vec')) vecBox.checked = true;
if (Q.get('zoom')) zoomR.value = Q.get('zoom');
game.scale = Number(Q.get('td') ?? 2);          // texel density the rigs are baked at
const bg = new Image(); bg.src = `assets/${Q.get('bg') ?? 'bg/s01_village'}.webp`;
const rows = ids.map((id) => {
  const d = ENEMIES[id];
  const cases = (CASES[id] ?? CASES.skeleton)(d);
  return { id, d, cases: cases.map(([label, f]) => ({ label, f, e: mkEnt(d, f) })) };
});
function mkEnt(d, f) {
  return {
    def: d, id: d.id, t: 0, anim: 'idle', animT: 0, state: 'idle', stateT: 0, flashT: 0, stun: 0, dying: 0, params: { ...(d.aiParams || {}) },
    facing: 1, scale: 1, elite: false, vx: 0, vy: 0, alpha: 1, onGround: !d.flying, hp: 1, stats: { maxHp: 1 },
    w: d.size?.w ?? 40, h: d.size?.h ?? 60, cx: 0, bottom: 0, x: 0, y: 0, ...f,
  };
}
const T0 = performance.now();
function frame() {
  const z = Number(zoomR.value), cellW = Number(Q.get('cellw') ?? 110), cellH = Number(Q.get('cellh') ?? 130);
  const cols = Math.max(...rows.map((r) => r.cases.length));
  const dpr = window.devicePixelRatio || 1;
  const W_ = Math.ceil(cols * cellW * z + 20), H_ = Math.ceil(rows.length * cellH * z + 20);
  if (cv.width !== W_ * dpr) { cv.width = W_ * dpr; cv.height = H_ * dpr; cv.style.width = W_ + 'px'; cv.style.height = H_ + 'px'; }
  globalThis.__paintedEnemies = !vecBox.checked;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120c14'; ctx.fillRect(0, 0, W_, H_);
  if (bg.complete && bg.naturalWidth) { ctx.globalAlpha = 0.85; ctx.drawImage(bg, 0, 0, W_, W_ * bg.naturalHeight / bg.naturalWidth); ctx.globalAlpha = 1; }
  const t = Q.get('t') ? Number(Q.get('t')) : (performance.now() - T0) / 1000;
  rows.forEach((r, ri) => r.cases.forEach((c, ci) => {
    const e = c.e, f = c.f;
    e.t = t + (f.tOff ?? 0);
    if (f.animT === undefined && !Q.get('t')) e.animT = e.t % 2;
    if (f.hpK) { e.hp = f.hpK; e.stats.maxHp = 1; }
    const x0 = 10 + ci * cellW * z, y0 = 10 + ri * cellH * z;
    ctx.save();
    ctx.translate(x0, y0); ctx.scale(z, z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(2, 2, cellW - 4, cellH - 4);
    ctx.fillStyle = 'rgba(40,30,20,0.6)'; ctx.fillRect(2, cellH - 16, cellW - 4, 14);
    e.cx = cellW / 2; e.bottom = r.d.flying ? cellH * 0.55 + (r.d.size?.h ?? 40) / 2 : cellH - 16;
    try { drawEnemy(ctx, e, null); } catch (err) { console.error(r.id, c.label, err); }
    ctx.fillStyle = '#ffd98a'; ctx.font = '9px sans-serif'; ctx.fillText(`${r.id} · ${c.label}`, 5, 11);
    ctx.restore();
  }));
  document.getElementById('info').textContent = JSON.stringify(rigStats());
  window.__galleryReady = Object.values(rigStats()).every((s) => s.ready || s.failed) && Object.keys(rigStats()).length > 0;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
