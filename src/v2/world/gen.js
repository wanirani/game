// WORLD: small helpers for writing areas with the env kit (docs/v2/AREA_FORMAT.md). Pure data builders - no DOM, runs in node.
export const D = Math.PI / 180;
export const rnd = (seed) => { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };

/**
 * A row house facing the camera: one wall part + one roof part (kit format).
 * o = { x, z, w, h, d = 90, y = 0, style: 'stone' | 'timber' | 'rubble' | 'plaster', seed, base (raised pavement height in front),
 *       lit (0..1 share of lit windows), door (u from the left end | false), doorOpt, shop (big ground-floor window), sign, banner (colour), sconce,
 *       burnt (true = roofless ruin with a ragged top), roof (false = none), roofMat ('slate' | 'thatch'), roofH, faces, tint, kit (overrides), chunk }
 */
export function house(o) {
  const { x, z, w, h } = o, d = o.d ?? 90, y = o.y ?? 0, r = rnd(o.seed ?? ((x * 31 + w * 7 + h) | 0)), st = o.style ?? 'stone', base = o.base ?? 0;
  const timber = st === 'timber', storey = timber ? (o.storey ?? 146) : 0, lit = o.burnt ? 0 : o.lit ?? 0.4, wins = [], doors = [], hang = [];
  const L = () => (r() < lit ? 0.45 + 0.45 * r() : 0);
  const du = o.door === false ? null : o.door ?? Math.round(w * (0.22 + 0.56 * r()));
  if (du != null) doors.push({ u: du, w: 58, h: 104, arch: timber ? undefined : 'round', rise: base, ...(o.doorOpt ?? {}) });
  const n = Math.max(1, Math.floor(w / 128));
  for (let i = 0; i < n; i++) {
    const u = Math.round(w * (i + 0.5) / n + (r() - 0.5) * 14);
    if ((du != null && Math.abs(u - du) < 72) || u < 36 || u > w - 36) { r(); continue; }
    if (o.shop && i === (du != null && du < w / 2 ? n - 1 : 0)) wins.push({ u, y: 60, w: 84, h: 64, lit: o.burnt ? 0 : 0.9, cols: 3, rows: 2 });
    else wins.push({ u, y: 64, w: 42, h: 62, lit: L(), shutters: r() < 0.45 });
  }
  const n2 = Math.max(1, Math.floor(w / 118));
  for (let fy = timber ? storey + 30 : 176, f = 0; fy + 70 < h - 14; fy += timber ? 96 : 108, f++) for (let i = 0; i < n2; i++) {
    const u = Math.round(w * (i + 0.5) / n2 + (r() - 0.5) * 12);
    wins.push(timber ? { u, y: fy, w: 40, h: 56, lit: L(), frame: 'timber' } : { u, y: fy, w: 42, h: 68, lit: L(), arch: f === 0 && st === 'stone' ? 'round' : undefined });
  }
  if (o.burnt) for (const s of wins) if (r() < 0.3) s.lit = 0.95;   // fire inside
  if (o.sign) hang.push({ type: 'sign', u: du ?? w / 2, y: 126, w: 78, h: 20, ...(typeof o.sign === 'object' ? o.sign : {}) });
  if (o.banner) hang.push({ type: 'banner', u: Math.round(w * 0.5 + (du != null && Math.abs(w * 0.5 - du) < 60 ? 90 : 0)), y: 62, len: 88, w: 34, c: o.banner });
  if (o.sconce) hang.push({ type: 'sconce', u: Math.round((du ?? w * 0.4) + 62), y: 118 });
  const tint = o.burnt ? [0.52, 0.46, 0.46] : o.tint ?? [0.96 + 0.08 * r(), 0.95 + 0.06 * r(), 0.94 + 0.1 * r()];
  const kit = {
    style: st, faces: o.faces ?? 'F', base, tint, windows: wins, doors, hang,
    ...(timber ? { storey, jetty: o.jetty ?? 12, mid: h > 300 ? storey + 104 : undefined } : st === 'stone' ? { quoins: r() < 0.6, courses: h > 240 ? [156] : [] } : { plinth: 26 }),
    ...(o.burnt ? { battlement: true, cornice: false, quoins: false } : {}), ...(o.kit ?? {}),
  };
  const parts = [{ t: 'wall', x, z, w, d, h, y, mat: st === 'timber' || st === 'plaster' ? 'plaster' : 'facade', kit, chunk: o.chunk }];
  if (o.roof !== false && !o.burnt) {
    const rk = { mat: o.roofMat, chimney: 'fieldstone', gable: st === 'stone' ? 'ashlar' : st === 'rubble' ? 'fieldstone' : undefined, chimneys: [{ u: Math.round(w * (0.18 + 0.64 * r())), t: 0.72, h: 30 + 10 * r() }], dormers: w > 400 && r() < 0.7 ? [{ u: Math.round(w * (0.3 + 0.4 * r())), lit: r() < lit ? 0.5 : 0 }] : [] };
    parts.push({ t: 'roof', x, z, w, d, y: y + h, h: o.roofH ?? Math.round(56 + 16 * r()), kit: { ...rk, ...(o.roofKit ?? {}) }, chunk: o.chunk });
  }
  return parts;
}

/** set chunk on every part that has none */
export const inChunk = (chunk, parts) => parts.map((p) => (p.chunk ? p : { ...p, chunk }));
/** rectangle helper for exits / triggers */
export const rect = (x, z, w, d) => ({ x0: x, x1: x + w, z0: z, z1: z + d });
