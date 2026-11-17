// v2 char3d 도구 공용: GLB 읽기 · 쓰기 (node). docs/v2/CHAR3D_PILOT.md §5
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGLB } from '../../src/v2/char3d/glb.js';

export function readGLB(path) {
  const b = readFileSync(path);
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const g = parseGLB(ab);
  return { json: g.json, bin: new Uint8Array(g.bin) };   // bin 은 복사본 (고쳐도 됨)
}
export function writeGLB(path, json, bin) {
  const pad = (n) => (4 - (n % 4)) % 4;
  json.buffers = [{ byteLength: bin.byteLength }];
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc(pad(js.length), 0x20)]);
  const bn = Buffer.concat([Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength), Buffer.alloc(pad(bin.byteLength))]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bn.length, 8);
  const h1 = Buffer.alloc(8); h1.writeUInt32LE(js.length, 0); h1.writeUInt32LE(0x4e4f534a, 4);
  const h2 = Buffer.alloc(8); h2.writeUInt32LE(bn.length, 0); h2.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([head, h1, js, h2, bn]));
  return 12 + 8 + js.length + 8 + bn.length;
}
/** float32 VEC3 접근자의 DataView 와 (오프셋, 보폭, 개수) */
export function vec3View(g, accIndex) {
  const a = g.json.accessors[accIndex], bv = g.json.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.type !== 'VEC3') throw new Error('float VEC3 접근자가 아닙니다');
  return { dv: new DataView(g.bin.buffer, g.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)), stride: bv.byteStride || 12, count: a.count, acc: a };
}
