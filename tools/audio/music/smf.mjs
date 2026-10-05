// 최소 표준 MIDI 파일(SMF format 1) 작성기
// writeSMF({ ppq, tracks: [[{ tick, type:'meta'|'ch', ... }]] }) → Buffer
const vlq = (n) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
const str = (s) => [...Buffer.from(s, 'utf8')];
// 같은 틱: 메타 → 프로그램/CC → 노트오프 → 노트온
const ORD = { meta: 0, prog: 1, cc: 2, off: 3, on: 4 };

export function writeSMF({ ppq, tracks }) {
  const chunks = [Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (ppq >> 8) & 0xff, ppq & 0xff])];
  for (const tr of tracks) {
    const ev = tr.map((e, i) => ({ ...e, i })).sort((a, b) => a.tick - b.tick || ORD[a.k] - ORD[b.k] || a.i - b.i);
    const out = []; let last = 0;
    for (const e of ev) {
      out.push(...vlq(e.tick - last)); last = e.tick;
      const c = e.ch & 0x0f;
      switch (e.k) {
        case 'meta': { const d = typeof e.data === 'string' ? str(e.data) : e.data; out.push(0xff, e.type, ...vlq(d.length), ...d); break; }
        case 'prog': out.push(0xc0 | c, e.prog & 0x7f); break;
        case 'cc': out.push(0xb0 | c, e.cc & 0x7f, e.val & 0x7f); break;
        case 'on': out.push(0x90 | c, e.key & 0x7f, e.vel & 0x7f); break;
        case 'off': out.push(0x80 | c, e.key & 0x7f, 64); break;
      }
    }
    out.push(0, 0xff, 0x2f, 0);
    const body = Buffer.from(out), hd = Buffer.alloc(8);
    hd.write('MTrk', 0); hd.writeUInt32BE(body.length, 4);
    chunks.push(hd, body);
  }
  return Buffer.concat(chunks);
}
export const meta = {
  name: (tick, s) => ({ tick, k: 'meta', type: 0x03, data: s }),
  marker: (tick, s) => ({ tick, k: 'meta', type: 0x06, data: s }),
  port: (tick, p) => ({ tick, k: 'meta', type: 0x21, data: [p] }),
  tempo: (tick, us) => ({ tick, k: 'meta', type: 0x51, data: [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] }),
  timesig: (tick, num, den) => ({ tick, k: 'meta', type: 0x58, data: [num, Math.round(Math.log2(den)), 24, 8] }),
};
