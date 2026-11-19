// v2 interface - the small pictures of things, drawn in code in the kit's line (docs/v2/UI_API.md 10.5): a dark outline, a pale silver line over
// it, one soft fill, a gold or ruby accent where the thing has one. No image is loaded. Bake time only: icon(ctx, name, cx, cy, size) draws into the
// current units, bakeIcon(name, size, s) keeps one small canvas per (name, size, scale).
//   the chronicle and the bag (pause rows, chip, headers): book bag            things of the story: shard knot notice key_silver key_rust slip bread
//   chisel handbell knell feather            choices: key_silver key_iron statue crate            Rook's goods: draught oil guide            coin
import { makeCanvas, COL, TAU } from './draw.js';

const INK = 'rgba(4,5,14,0.9)', LINE = '#eef2ff';
/** fill the current path (a colour or [top, bottom] over y0..y1), then the dark outline and the pale line */
function done(c, fill, line = LINE, y0 = -40, y1 = 40, lw = 4.2) {
  if (fill) {
    if (Array.isArray(fill)) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, fill[0]); g.addColorStop(1, fill[1]); c.fillStyle = g; } else c.fillStyle = fill;
    c.fill();
  }
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.lineWidth = lw * 2; c.strokeStyle = INK; c.stroke();
  if (fill) c.fill();
  c.lineWidth = lw; c.strokeStyle = line; c.stroke();
}
const seg = (c, a, b, d, e) => { c.beginPath(); c.moveTo(a, b); c.lineTo(d, e); };
const dot = (c, x, y, r, col) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = col; c.fill(); };
function glint(c, x, y, r, col = '#ffffff') {
  c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.closePath();
  c.fillStyle = col; c.fill();
}
/** a bell body with its mouth at y = bot (the same bell as the ending card's) */
function bellPath(c, x, top, bot, r) {
  const h = bot - top;
  c.beginPath(); c.moveTo(x - r, bot); c.quadraticCurveTo(x - r * 0.64, bot - h * 0.3, x - r * 0.56, top + h * 0.42); c.quadraticCurveTo(x - r * 0.52, top, x, top);
  c.quadraticCurveTo(x + r * 0.52, top, x + r * 0.56, top + h * 0.42); c.quadraticCurveTo(x + r * 0.64, bot - h * 0.3, x + r, bot); c.closePath();
}
/** a key lying along +x: the bow at the left (round, or four-cornered for iron), two teeth at the right */
function keyPath(c, square) {
  c.beginPath();
  if (square) { c.moveTo(-40, 0); c.lineTo(-25, -15); c.lineTo(-10, 0); c.lineTo(-25, 15); c.closePath(); c.moveTo(-31, 0); c.lineTo(-25, 6); c.lineTo(-19, 0); c.lineTo(-25, -6); c.closePath(); }
  else { c.arc(-25, 0, 15, 0, TAU); c.moveTo(-18, 0); c.arc(-25, 0, 7, 0, TAU, true); }
  c.moveTo(-10, -4); c.lineTo(40, -4); c.lineTo(40, 16); c.lineTo(33, 16); c.lineTo(33, 4); c.lineTo(27, 4); c.lineTo(27, 12); c.lineTo(20, 12); c.lineTo(20, 4); c.lineTo(-10, 4); c.closePath();
}

const DRAW = {
  // the chronicle: an open book, the page of that night warm, the page of tonight cold
  book(c) {
    c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(-20, -34, -42, -24); c.lineTo(-42, 26); c.quadraticCurveTo(-20, 16, 0, 26); c.closePath(); done(c, ['rgba(255,150,160,0.50)', 'rgba(120,30,50,0.55)']);
    c.beginPath(); c.moveTo(0, -24); c.quadraticCurveTo(20, -34, 42, -24); c.lineTo(42, 26); c.quadraticCurveTo(20, 16, 0, 26); c.closePath(); done(c, ['rgba(214,226,255,0.55)', 'rgba(70,84,130,0.55)']);
    c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 3; i++) { seg(c, -34, -12 + i * 10, -9, -16 + i * 10); c.stroke(); seg(c, 9, -16 + i * 10, 34, -12 + i * 10); c.stroke(); }
    seg(c, 0, -24, 0, 26); c.lineWidth = 3; c.strokeStyle = COL.gold; c.stroke();
    c.beginPath(); c.moveTo(-4, 26); c.lineTo(0, 38); c.lineTo(4, 26); c.closePath(); c.fillStyle = COL.gold; c.fill();
  },
  // the bag: a satchel with its flap and strap
  bag(c) {
    c.beginPath(); c.moveTo(-18, -14); c.quadraticCurveTo(0, -48, 18, -14); c.lineWidth = 9; c.strokeStyle = INK; c.lineCap = 'round'; c.stroke(); c.lineWidth = 4.2; c.strokeStyle = '#c9a070'; c.stroke();
    c.beginPath(); c.moveTo(-30, -10); c.quadraticCurveTo(-38, 34, -24, 38); c.lineTo(24, 38); c.quadraticCurveTo(38, 34, 30, -10); c.closePath(); done(c, ['#b98a55', '#5e3d1e']);
    c.beginPath(); c.moveTo(-33, -12); c.quadraticCurveTo(0, -24, 33, -12); c.quadraticCurveTo(22, 12, 0, 14); c.quadraticCurveTo(-22, 12, -33, -12); c.closePath(); done(c, ['#d2a56c', '#8a5c2e']);
    c.beginPath(); c.rect(-6, 8, 12, 12); done(c, COL.gold, '#fff6d8', -40, 40, 2.6);
  },
  // a piece of the cracked bell: the same sound as the big one
  shard(c) {
    c.beginPath(); c.moveTo(-22, 30); c.lineTo(-32, -6); c.quadraticCurveTo(-20, -34, 6, -38); c.lineTo(22, -12); c.lineTo(8, 2); c.lineTo(20, 26); c.closePath(); done(c, ['rgba(214,238,255,0.92)', 'rgba(70,120,190,0.86)']);
    c.beginPath(); c.moveTo(-26, 12); c.quadraticCurveTo(-8, 4, 14, 14); c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    c.beginPath(); c.moveTo(-6, -32); c.lineTo(-2, -14); c.lineTo(-10, -2); c.strokeStyle = 'rgba(20,40,80,0.8)'; c.stroke();
    glint(c, 26, -30, 10); glint(c, -36, 34, 6, COL.ice);
  },
  // the Valkrein knot: the whip's end tied round the shard
  knot(c) {
    c.beginPath(); c.moveTo(-42, 26); c.bezierCurveTo(-8, 16, -34, -30, -2, -30); c.bezierCurveTo(30, -30, 12, 14, -8, 2); c.bezierCurveTo(-26, -10, 16, -36, 30, -16);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 12; c.strokeStyle = INK; c.stroke(); c.lineWidth = 7; c.strokeStyle = '#b98a55'; c.stroke(); c.lineWidth = 2; c.strokeStyle = '#f0d2a0'; c.stroke();
    c.beginPath(); c.moveTo(34, -30); c.lineTo(44, -12); c.lineTo(32, 2); c.lineTo(22, -14); c.closePath(); done(c, ['rgba(214,238,255,0.95)', 'rgba(70,120,190,0.9)'], LINE, -30, 2, 3);
  },
  // Wolfram's notice: a nailed sheet, the reward box empty
  notice(c) {
    c.beginPath(); c.moveTo(-26, -36); c.lineTo(26, -36); c.lineTo(26, 30); c.lineTo(16, 36); c.lineTo(8, 30); c.lineTo(-2, 37); c.lineTo(-12, 30); c.lineTo(-20, 36); c.lineTo(-26, 30); c.closePath(); done(c, ['#efe6cf', '#b8a880']);
    c.lineWidth = 3; c.strokeStyle = 'rgba(40,30,20,0.75)'; for (let i = 0; i < 3; i++) { seg(c, -17, -20 + i * 9, i === 2 ? 4 : 17, -20 + i * 9); c.stroke(); }
    c.setLineDash([4, 3]); c.beginPath(); c.rect(-14, 10, 28, 13); c.lineWidth = 2.6; c.strokeStyle = COL.rubyDeep; c.stroke(); c.setLineDash([]);
    dot(c, 0, -30, 3.6, '#5d6a94');
  },
  // the order slip of the smithy: the name box empty for a hundred years, the seal paid in advance
  slip(c) {
    c.beginPath(); c.moveTo(-36, -22); c.lineTo(24, -22); c.lineTo(36, -10); c.lineTo(36, 24); c.lineTo(-36, 24); c.closePath(); done(c, ['#efe6cf', '#b8a880']);
    c.beginPath(); c.moveTo(24, -22); c.lineTo(24, -10); c.lineTo(36, -10); c.lineWidth = 2.6; c.strokeStyle = 'rgba(40,30,20,0.7)'; c.stroke();
    c.setLineDash([4, 3]); c.beginPath(); c.rect(-28, -14, 34, 11); c.strokeStyle = 'rgba(40,30,20,0.8)'; c.stroke(); c.setLineDash([]);
    c.lineWidth = 3; seg(c, -28, 6, 8, 6); c.stroke(); seg(c, -28, 15, -2, 15); c.stroke();
    c.beginPath(); c.arc(22, 10, 9, 0, TAU); done(c, [COL.ruby, COL.rubyDeep], '#ffb0bc', 1, 19, 2.4);
  },
  // the silver key: a round bow, bright, it has not changed in a hundred years
  key_silver(c) { c.rotate(-0.62); keyPath(c, false); done(c, ['#ffffff', '#93a1cb'], '#ffffff', -16, 16); c.rotate(0.62); glint(c, -30, 2, 11); glint(c, 30, -30, 6); },
  // an iron key as the smith would make it today: a four-cornered bow, dark
  key_iron(c) { c.rotate(-0.62); keyPath(c, true); done(c, ['#6a7088', '#22253a'], '#b9c2de', -16, 16); c.rotate(0.62); },
  // what an iron key is after a hundred years: a rusted lump, the bit broken off
  key_rust(c) {
    c.rotate(-0.62);
    c.beginPath(); c.moveTo(-41, -2); c.lineTo(-33, -13); c.lineTo(-22, -16); c.lineTo(-12, -9); c.lineTo(-8, -5); c.lineTo(6, -6); c.lineTo(14, -2); c.lineTo(11, 3); c.lineTo(17, 7); c.lineTo(4, 6); c.lineTo(-9, 5); c.lineTo(-14, 12); c.lineTo(-27, 16); c.lineTo(-38, 9); c.closePath();
    done(c, ['#c9692e', '#5a2610'], '#f2b98a', -16, 16);
    c.beginPath(); c.arc(-25, 0, 5, 0, TAU); c.fillStyle = 'rgba(20,8,4,0.8)'; c.fill();
    c.beginPath(); c.moveTo(26, -2); c.lineTo(36, -5); c.lineTo(39, 4); c.lineTo(30, 8); c.closePath(); done(c, ['#b85c28', '#5a2610'], '#f2b98a', -6, 8, 3);
    c.rotate(0.62);
    dot(c, -22, -2, 3, '#ff9a4a'); dot(c, -6, 2, 2.4, '#ffb060'); dot(c, 6, 26, 3, '#a4532a'); dot(c, 18, 30, 2.2, '#a4532a'); dot(c, -4, 34, 2, '#a4532a');
  },
  // Lotte's rye bread
  bread(c) {
    c.beginPath(); c.moveTo(-38, 14); c.quadraticCurveTo(-42, -20, 0, -24); c.quadraticCurveTo(42, -20, 38, 14); c.quadraticCurveTo(0, 26, -38, 14); c.closePath(); done(c, ['#d09a58', '#6e4520'], '#ffe2b0', -24, 22);
    c.lineWidth = 3.4; c.strokeStyle = 'rgba(60,30,10,0.75)'; for (let i = -1; i <= 1; i++) { seg(c, i * 17 - 5, -12, i * 17 + 5, 6); c.stroke(); }
  },
  // the grave keeper's chisel
  chisel(c) {
    c.rotate(-0.7);
    c.beginPath(); c.rect(-42, -7, 36, 14); done(c, ['#b98a55', '#5e3d1e'], '#f0d2a0', -7, 7);
    c.beginPath(); c.rect(-8, -8.5, 7, 17); done(c, COL.gold, '#fff6d8', -8, 8, 2.6);
    c.beginPath(); c.moveTo(-1, -5); c.lineTo(30, -5); c.lineTo(42, 0); c.lineTo(30, 9); c.lineTo(-1, 5); c.closePath(); done(c, ['#f4f7ff', '#8492bd'], LINE, -6, 9);
    c.rotate(0.7);
  },
  // a road bell: small, bronze, hung where someone should hear
  handbell(c) {
    c.beginPath(); c.arc(0, -30, 7, 0, TAU); c.lineWidth = 8; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.6; c.strokeStyle = COL.gold; c.stroke();
    bellPath(c, 0, -24, 22, 30); done(c, ['#f6dc9a', '#a6772c'], '#fff6d8', -24, 22);
    c.beginPath(); c.moveTo(-24, 10); c.quadraticCurveTo(0, 16, 24, 10); c.lineWidth = 2.6; c.strokeStyle = 'rgba(90,50,10,0.7)'; c.stroke();
    c.beginPath(); c.arc(0, 30, 6, 0, TAU); done(c, COL.goldDeep, '#fff6d8', 24, 36, 2.6);
  },
  // a knell: pale and tall, a dark ribbon on its yoke
  knell(c) {
    bellPath(c, 0, -26, 24, 25); done(c, ['#f2f5ff', '#6f7ba6'], LINE, -26, 24);
    c.beginPath(); c.moveTo(-20, 12); c.quadraticCurveTo(0, 17, 20, 12); c.lineWidth = 2.6; c.strokeStyle = 'rgba(30,36,70,0.75)'; c.stroke();
    c.beginPath(); c.arc(0, 31, 5.5, 0, TAU); done(c, '#8492bd', LINE, 26, 36, 2.6);
    c.beginPath(); c.moveTo(0, -28); c.lineTo(-18, -40); c.lineTo(-16, -24); c.closePath(); c.moveTo(0, -28); c.lineTo(18, -40); c.lineTo(16, -24); c.closePath(); done(c, ['#3a1420', '#12060c'], '#c0566c', -40, -24, 2.6);
    c.beginPath(); c.moveTo(-3, -27); c.lineTo(-10, -8); c.moveTo(3, -27); c.lineTo(11, -10); c.lineWidth = 6; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#8e1226'; c.stroke();
  },
  // a crow's feather
  feather(c) {
    c.beginPath(); c.moveTo(-28, 30); c.quadraticCurveTo(-34, -12, 30, -38); c.quadraticCurveTo(22, 8, -14, 32); c.closePath(); done(c, ['#4a5278', '#11132a'], '#aab6e0', -38, 32);
    c.beginPath(); c.moveTo(-36, 40); c.quadraticCurveTo(-6, 6, 28, -36); c.lineWidth = 3; c.strokeStyle = '#dfe6fb'; c.stroke();
    c.lineWidth = 2; c.strokeStyle = 'rgba(170,186,230,0.6)'; for (let i = 0; i < 4; i++) { seg(c, -16 + i * 10, 14 - i * 12, -24 + i * 12, 2 - i * 11); c.stroke(); seg(c, -16 + i * 10, 14 - i * 12, -2 + i * 9, 16 - i * 12); c.stroke(); }
  },
  // a stone saint on its plinth: stone stays
  statue(c) {
    c.beginPath(); c.rect(-26, 26, 52, 13); done(c, ['#aeb4c8', '#565b72']);
    c.beginPath(); c.moveTo(-13, -16); c.quadraticCurveTo(-22, 8, -19, 26); c.lineTo(19, 26); c.quadraticCurveTo(22, 8, 13, -16); c.quadraticCurveTo(0, -24, -13, -16); c.closePath(); done(c, ['#c6cbdc', '#5d6278']);
    c.beginPath(); c.arc(0, -29, 10, 0, TAU); done(c, ['#d6dbea', '#7d839a'], LINE, -39, -19);
    c.lineWidth = 2.6; c.strokeStyle = 'rgba(30,34,56,0.6)'; seg(c, -7, -6, -10, 24); c.stroke(); seg(c, 7, -6, 10, 24); c.stroke(); seg(c, -8, 2, 8, 2); c.stroke();
  },
  // a nailed wooden crate: wood does not last
  crate(c) {
    c.beginPath(); c.rect(-32, -28, 64, 60); done(c, ['#c08a4c', '#5e3b1a'], '#f0d2a0');
    c.lineWidth = 3; c.strokeStyle = 'rgba(50,26,8,0.75)'; seg(c, -32, -9, 32, -9); c.stroke(); seg(c, -32, 13, 32, 13); c.stroke(); seg(c, -26, 26, 26, -22); c.lineWidth = 5; c.strokeStyle = 'rgba(240,210,160,0.55)'; c.stroke();
    for (const [x, y] of [[-25, -21], [25, -21], [-25, 25], [25, 25]]) dot(c, x, y, 2.6, '#e8eeff');
  },
  // a bottle of holy water: used by itself when the hero would fall
  draught(c) {
    c.beginPath(); c.rect(-8, -44, 16, 9); done(c, ['#c9a070', '#7a5a34'], '#f0d2a0', -44, -35, 2.6);
    c.beginPath(); c.moveTo(-7, -35); c.lineTo(-7, -18); c.quadraticCurveTo(-30, -8, -27, 16); c.quadraticCurveTo(-24, 38, 0, 38); c.quadraticCurveTo(24, 38, 27, 16); c.quadraticCurveTo(30, -8, 7, -18); c.lineTo(7, -35); c.closePath();
    done(c, ['rgba(226,240,255,0.42)', 'rgba(120,160,220,0.42)']);
    c.save(); c.clip(); c.fillStyle = 'rgba(120,200,255,0.78)'; c.fillRect(-30, 2, 60, 40); c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-30, 2, 60, 2.6); c.restore();
    c.lineWidth = 3.2; c.strokeStyle = '#ffffff'; seg(c, 0, 9, 0, 29); c.stroke(); seg(c, -8, 16, 8, 16); c.stroke();
    c.beginPath(); c.moveTo(-17, -4); c.quadraticCurveTo(-22, 6, -19, 16); c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
  },
  // bell oil: a small cruet and its drop
  oil(c) {
    c.beginPath(); c.moveTo(-24, 0); c.quadraticCurveTo(-26, 36, -6, 36); c.lineTo(8, 36); c.quadraticCurveTo(26, 36, 24, 0); c.quadraticCurveTo(22, -12, 8, -14); c.lineTo(8, -26); c.lineTo(-8, -26); c.lineTo(-8, -14); c.quadraticCurveTo(-22, -12, -24, 0); c.closePath();
    done(c, ['#f6dc9a', '#9a6a22'], '#fff6d8', -26, 36);
    c.beginPath(); c.rect(-11, -34, 22, 8); done(c, ['#dfe6fb', '#6f7ba6'], LINE, -34, -26, 2.6);
    c.beginPath(); c.moveTo(-15, 6); c.quadraticCurveTo(-18, 18, -12, 26); c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    c.beginPath(); c.moveTo(36, -30); c.quadraticCurveTo(44, -14, 36, -10); c.quadraticCurveTo(28, -14, 36, -30); c.closePath(); done(c, COL.gold, '#fff6d8', -30, -10, 2.4);
  },
  // the guide candle: a flame that points
  guide(c) {
    c.beginPath(); c.ellipse(0, 32, 24, 7, 0, 0, TAU); done(c, ['#dfe6fb', '#6f7ba6'], LINE, 25, 39, 3);
    c.beginPath(); c.rect(-9, -8, 18, 38); done(c, ['#fbf4e2', '#b8ab8c'], '#ffffff', -8, 30);
    c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(13, -24, 0, -10); c.quadraticCurveTo(-13, -24, 0, -42); c.closePath(); done(c, ['#fff8dc', '#f1a23a'], '#fff6d8', -42, -10, 2.6);
    c.lineWidth = 3; c.strokeStyle = COL.gold; c.lineCap = 'round'; seg(c, 20, -34, 32, -42); c.stroke(); seg(c, 24, -22, 38, -22); c.stroke(); seg(c, -20, -34, -32, -42); c.stroke(); seg(c, -24, -22, -38, -22); c.stroke();
  },
  // a silver coin with the struck bell
  coin(c) {
    c.beginPath(); c.arc(0, 0, 32, 0, TAU); done(c, ['#ffffff', '#8492bd'], '#ffffff', -32, 32);
    c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.lineWidth = 2.4; c.strokeStyle = 'rgba(40,48,90,0.6)'; c.stroke();
    bellPath(c, 0, -14, 10, 13); c.fillStyle = 'rgba(40,48,90,0.72)'; c.fill(); dot(c, 0, 14, 3.4, 'rgba(40,48,90,0.72)');
  },
  // the mark of a row that is still a blank: an empty frame
  blank(c) { c.setLineDash([7, 6]); c.beginPath(); c.rect(-30, -22, 60, 44); c.lineWidth = 3; c.strokeStyle = 'rgba(214,224,250,0.7)'; c.stroke(); c.setLineDash([]); },
  // close: a cross
  close(c) { c.lineCap = 'round'; c.beginPath(); c.moveTo(-18, -18); c.lineTo(18, 18); c.moveTo(18, -18); c.lineTo(-18, 18); c.lineWidth = 11; c.strokeStyle = INK; c.stroke(); c.lineWidth = 5.5; c.strokeStyle = LINE; c.stroke(); },
};
export const ICONS = Object.freeze(Object.keys(DRAW));
export const hasIcon = (name) => typeof DRAW[name] === 'function';

/** draw icon `name` centred at (cx, cy), `size` across (the drawing box is 100 units) */
export function icon(ctx, name, cx, cy, size) {
  const f = DRAW[name]; if (!f) return false;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(size / 100, size / 100);
  try { f(ctx); } finally { ctx.restore(); }
  return true;
}
const cache = new Map();
/** one small canvas per (name, size, scale): { c, w } - draw with drawImage(c, x - w / 2, y - w / 2, w, w) */
export function bakeIcon(name, size, s) {
  const key = name + '|' + Math.round(size * 4) + '|' + s;
  let p = cache.get(key);
  if (!p) {
    const w = size * 1.12, c = makeCanvas(w * s, w * s), k = c.getContext('2d');
    k.setTransform(s, 0, 0, s, 0, 0); icon(k, name, w / 2, w / 2, size);
    p = { c, w }; cache.set(key, p);
    if (cache.size > 160) { const first = cache.keys().next().value; const q = cache.get(first); q.c.width = 1; q.c.height = 1; cache.delete(first); }
  }
  return p;
}
export function releaseIcons() { for (const p of cache.values()) { p.c.width = 1; p.c.height = 1; } cache.clear(); }
