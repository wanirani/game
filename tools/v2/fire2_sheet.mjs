// FIRE-2: the flame flipbook (src/v2/fx/flamebook.js, painted in code) as a PNG to look at - no browser.
//   node tools/v2/fire2_sheet.mjs [--out /tmp/claude-0/v2/fire2/sheet.png] [--time 1 (ms to paint all frames)]
// Top two rows: the 16 looping FLAME frames, third row: the 8 WISP frames (played once over a tongue's life), on black, as the particle
// shader adds them (colour x alpha, vertex colour 1).
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { FLIP, paintFlame } from '../../src/v2/fx/flamebook.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => { if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]); return a; }, []));
const OUT = String(args.out || '/tmp/claude-0/v2/fire2/sheet.png');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const W = FLIP.W, H = FLIP.H, SW = W * 8, SH = H * 3, px = new Uint8Array(SW * SH * 3), fr = new Uint8ClampedArray(W * H * 4);
const t0 = performance.now();
for (let k = 0; k < 2; k++) for (let i = 0; i < (k ? FLIP.WISP : FLIP.FLAME); i++) {
  paintFlame(k, i, fr);
  const ox = (i % 8) * W, oy = (k ? 2 : (i / 8) | 0) * H;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (y * W + x) * 4, d = ((oy + y) * SW + ox + x) * 3, a = fr[s + 3] / 255; px[d] = fr[s] * a; px[d + 1] = fr[s + 1] * a; px[d + 2] = fr[s + 2] * a; }
}
const ms = performance.now() - t0;
// minimal PNG (RGB8)
const crcT = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
const raw = Buffer.alloc((SW * 3 + 1) * SH); for (let y = 0; y < SH; y++) Buffer.from(px.buffer, y * SW * 3, SW * 3).copy(raw, y * (SW * 3 + 1) + 1);
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(SW, 0); ihdr.writeUInt32BE(SH, 4); ihdr[8] = 8; ihdr[9] = 2;
fs.writeFileSync(OUT, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`${OUT}  ${SW}x${SH}  painted 24 frames in ${ms.toFixed(0)} ms`);
