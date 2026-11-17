// v2 char3d — GLB(glTF 2.0 바이너리) 읽기. 라이브러리 없음. docs/v2/CHAR3D_PILOT.md
// 다루는 것: JSON + BIN 청크, 접근자(byteStride · 정규화 정수), 스킨 한 개, 노드 TRS, 애니메이션(LINEAR/STEP),
//   BIN 안에 든 PNG/JPEG/WebP 그림 (브라우저에서는 createImageBitmap 으로 푼다).
// 안 다루는 것: 여러 버퍼 · sparse 접근자 · 모프 타깃 · 카메라/빛 · KHR 확장(draco, meshopt, 텍스처 변환).
// 이 파일은 DOM 없이도 돈다 (node 의 도구가 같이 쓴다). 그림 풀기만 브라우저 전용이다.

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** ArrayBuffer → { json, bin(Uint8Array) } */
export function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB 파일이 아닙니다');
  const total = Math.min(dv.getUint32(8, true), dv.byteLength);
  let off = 12, json = null, bin = null;
  while (off + 8 <= total) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942 && !bin) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  if (!json) throw new Error('GLB 에 JSON 청크가 없습니다');
  return { json, bin: bin ?? new Uint8Array(0) };
}

/** 접근자 → 꽉 채운 TypedArray (복사본). 정규화 정수는 norm=true 일 때 실수로 푼다 */
export function readAccessor(g, index, norm = false) {
  const a = g.json.accessors[index], T = COMP[a.componentType], n = NUM[a.type], count = a.count;
  const out = new T(count * n);
  if (a.bufferView != null) {
    const bv = g.json.bufferViews[a.bufferView], base = g.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const size = T.BYTES_PER_ELEMENT * n, stride = bv.byteStride || size;
    const dv = new DataView(g.bin.buffer, base, Math.min(stride * (count - 1) + size, g.bin.byteLength - (base - g.bin.byteOffset)));
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let i = 0; i < count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[get](i * stride + k * T.BYTES_PER_ELEMENT, true);
  }
  if (norm && a.normalized && T !== Float32Array) {
    const f = new Float32Array(out.length), d = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] ?? 1;
    for (let i = 0; i < f.length; i++) f[i] = Math.max(-1, out[i] / d);
    return f;
  }
  return out;
}

function matToTRS(m) {
  const t = [m[12], m[13], m[14]];
  const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
  const r00 = m[0] / sx, r10 = m[1] / sx, r20 = m[2] / sx, r01 = m[4] / sy, r11 = m[5] / sy, r21 = m[6] / sy, r02 = m[8] / sz, r12 = m[9] / sz, r22 = m[10] / sz;
  const tr = r00 + r11 + r22; let x, y, z, w;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s; }
  else if (r00 > r11 && r00 > r22) { const s = Math.sqrt(1 + r00 - r11 - r22) * 2; w = (r21 - r12) / s; x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s; }
  else if (r11 > r22) { const s = Math.sqrt(1 + r11 - r00 - r22) * 2; w = (r02 - r20) / s; x = (r01 + r10) / s; y = s / 4; z = (r12 + r21) / s; }
  else { const s = Math.sqrt(1 + r22 - r00 - r11) * 2; w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = s / 4; }
  return { t, r: [x, y, z, w], s: [sx, sy, sz] };
}

/**
 * GLB → 그릴 수 있는 모양.
 * { nodes:[{name,parent,children,t,r,s}], order(부모 먼저), skin:{joints[], ibm(Float32Array 16n), names[]}|null,
 *   prims:[{pos,nrm,uv,joints(Uint16),weights(Float32),idx,image(그림 번호|-1),color[4],doubleSided}],
 *   images:[{mime,bytes}], anims:[{name,duration,channels:[{node,path,times,values,step}]}], stats }
 */
export function buildModel(g) {
  const J = g.json;
  const nodes = (J.nodes ?? []).map((n, i) => {
    const trs = n.matrix ? matToTRS(n.matrix) : { t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1] };
    return { index: i, name: n.name ?? 'node' + i, parent: -1, children: n.children ?? [], t: [...trs.t], r: [...trs.r], s: [...trs.s], mesh: n.mesh ?? -1, skin: n.skin ?? -1 };
  });
  for (const n of nodes) for (const c of n.children) nodes[c].parent = n.index;
  const order = [];
  const visit = (i) => { order.push(i); for (const c of nodes[i].children) visit(c); };
  for (const n of nodes) if (n.parent < 0) visit(n.index);
  let skin = null;
  if (J.skins?.length) {
    const s = J.skins[0];
    skin = { joints: [...s.joints], names: s.joints.map((j) => nodes[j].name), ibm: s.inverseBindMatrices != null ? new Float32Array(readAccessor(g, s.inverseBindMatrices)) : null };
    if (!skin.ibm) { skin.ibm = new Float32Array(16 * s.joints.length); for (let i = 0; i < s.joints.length; i++) { skin.ibm[i * 16] = skin.ibm[i * 16 + 5] = skin.ibm[i * 16 + 10] = skin.ibm[i * 16 + 15] = 1; } }
  }
  const prims = []; let tris = 0, verts = 0;
  for (const n of nodes) {
    if (n.mesh < 0) continue;
    for (const p of J.meshes[n.mesh].primitives) {
      if ((p.mode ?? 4) !== 4 || p.attributes.POSITION == null) continue;
      const A = p.attributes, pos = readAccessor(g, A.POSITION), cnt = pos.length / 3;
      const mat = p.material != null ? J.materials[p.material] : null, pbr = mat?.pbrMetallicRoughness ?? {};
      const texIdx = pbr.baseColorTexture?.index, tex = texIdx != null ? J.textures[texIdx] : null;
      const image = tex ? (tex.source ?? tex.extensions?.EXT_texture_webp?.source ?? -1) : -1;
      let joints = null, weights = null;
      if (A.JOINTS_0 != null && A.WEIGHTS_0 != null) { joints = Uint16Array.from(readAccessor(g, A.JOINTS_0)); weights = Float32Array.from(readAccessor(g, A.WEIGHTS_0, true)); }
      const idx = p.indices != null ? readAccessor(g, p.indices) : Uint32Array.from({ length: cnt }, (_, i) => i);
      prims.push({
        node: n.index, pos: Float32Array.from(pos), nrm: A.NORMAL != null ? Float32Array.from(readAccessor(g, A.NORMAL, true)) : null,
        uv: A.TEXCOORD_0 != null ? Float32Array.from(readAccessor(g, A.TEXCOORD_0, true)) : null, joints, weights,
        idx: cnt > 65535 ? Uint32Array.from(idx) : Uint16Array.from(idx), image, color: pbr.baseColorFactor ?? [1, 1, 1, 1], doubleSided: !!mat?.doubleSided,
      });
      tris += idx.length / 3; verts += cnt;
    }
  }
  const images = (J.images ?? []).map((im) => {
    if (im.bufferView == null) return { mime: im.mimeType ?? '', bytes: null, uri: im.uri ?? null };
    const bv = J.bufferViews[im.bufferView];
    return { mime: im.mimeType ?? 'image/png', bytes: g.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength) };
  });
  const anims = (J.animations ?? []).map((a, i) => {
    let duration = 0;
    const channels = [];
    for (const c of a.channels) {
      const s = a.samplers[c.sampler], path = c.target.path;
      if (c.target.node == null || !['translation', 'rotation', 'scale'].includes(path)) continue;
      const times = Float32Array.from(readAccessor(g, s.input)); let values = Float32Array.from(readAccessor(g, s.output, true));
      if (s.interpolation === 'CUBICSPLINE') { const n = path === 'rotation' ? 4 : 3, v = new Float32Array(times.length * n); for (let k = 0; k < times.length; k++) for (let q = 0; q < n; q++) v[k * n + q] = values[k * n * 3 + n + q]; values = v; }
      if (times.length) duration = Math.max(duration, times[times.length - 1]);
      channels.push({ node: c.target.node, path, times, values, step: s.interpolation === 'STEP' });
    }
    return { name: a.name ?? 'anim' + i, duration, channels };
  });
  return { nodes, order, skin, prims, images, anims, stats: { tris, verts, joints: skin?.joints.length ?? 0, prims: prims.length, images: images.length, anims: anims.length } };
}

/** 브라우저: 든 그림을 ImageBitmap 으로 (실패하면 null) */
export async function decodeImages(model) {
  const out = [];
  for (const im of model.images) {
    if (!im.bytes) { out.push(null); continue; }
    try { out.push(await createImageBitmap(new Blob([im.bytes], { type: im.mime || 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })); }
    catch { try { out.push(await createImageBitmap(new Blob([im.bytes], { type: im.mime || 'image/png' }))); } catch { out.push(null); } }
  }
  return out;
}

/** 브라우저: 주소에서 받아 모델로 */
export async function loadGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('GLB 를 받지 못했습니다: ' + url + ' (' + res.status + ')');
  const model = buildModel(parseGLB(await res.arrayBuffer()));
  model.bitmaps = await decodeImages(model);
  return model;
}
