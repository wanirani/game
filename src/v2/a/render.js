// 시범판 A — 세계 그리기 (Canvas 2D 만). docs/v2/proto_a.md §3
// 순서: 먼 배경 → 어두운 땅 → [A] 바닥 묶음(높이 낮은 것부터: 옆면 → 윗면 합집합에 무늬 띠) → 빛 웅덩이
//       → [B] 솟은 판·소품·캐릭터·안개 판을 깊이 순(먼 것부터)으로 → 이펙트
// 무늬: 윗면은 가로 띠(화면 한 줄 = 깊이 하나), 옆면은 세로 띠, 앞면은 그대로 — 모두 ctx.setTransform + 패턴 fillRect.
import { assets } from '../../core/assets.js';
import { PIT_Y, WALL } from './stage.js';

const STRIP = 6;            // 띠 두께 (화면 px)
const FAR = 3400;           // 이보다 먼 것은 그리지 않는다
const NIGHT = [9, 7, 20];   // 어둠 색
// 재질: tex = v1 타일 무늬, size = 무늬 한 장이 덮는 세계 px, tint = 밤 빛깔(곱하기), top/front/side = 면별 밝기
const MATS = {
  cobble: { tex: 'tex/tex_castle_stone', size: 256, tint: '#8088b0', top: 0.78, front: 0.5, side: 0.36, flat: '#3a3c50' },
  flag: { tex: 'tex/tex_mossy_stone', size: 300, tint: '#8a86a8', top: 0.7, front: 0.46, side: 0.34, flat: '#3c3a48' },
  kerb: { tex: 'tex/tex_mossy_stone', size: 420, tint: '#5c5a80', top: 0.36, front: 0.3, side: 0.24, flat: '#1c1a28' },
  brick: { tex: 'tex/tex_wet_stone', size: 300, tint: '#9a8cb0', top: 0.5, front: 0.62, side: 0.42, flat: '#232a48' },
  brick2: { tex: 'tex/tex_wet_stone', size: 340, tint: '#c8968a', top: 0.5, front: 0.56, side: 0.4, flat: '#3a2a34' },
  stone: { tex: 'tex/tex_castle_stone', size: 150, tint: '#9a90a8', top: 0.8, front: 0.56, side: 0.38, flat: '#34343e' },
  wood: { tex: 'tex/tex_wood', size: 150, tint: '#d0a070', top: 1.0, front: 0.8, side: 0.56, flat: '#3a2a20' },
  pit: { tex: null, flat: '#040308', top: 1, front: 1, side: 1 },
  none: { tex: null, flat: '#000', top: 1, front: 1, side: 1 },
};
// 소품 그림 (v1 에셋). ay = 발 위치(그림 높이 비), k = 크기, tint = 밤 빛깔
const PROPS = {
  pillar: { img: 'props/prop_pillar', k: 1.32, ay: 0.975, tint: '#9a94b8' },
  lamp: { img: 'props/deco_village_lamppost', k: 1.5, ay: 0.985, tint: '#b0a8c0', glow: 0.83, pool: 1 },
  fence: { img: 'props/deco_village_fence', k: 1.3, ay: 0.98, tint: '#3a3852' },
  cart: { img: 'props/deco_village_cart', k: 1.5, ay: 0.93, tint: '#444058' },
  haybale: { img: 'props/deco_village_haybale', k: 1.3, ay: 0.97, tint: '#3c3850' },
  barrel: { img: 'props/prop_barrel', k: 0.8, ay: 0.97, tint: '#9088a8' },
  crateP: { img: 'props/prop_crate', k: 0.8, ay: 0.99, tint: '#9088a8' },
  well: { img: 'props/deco_village_well', k: 1.25, ay: 0.95, tint: '#8e88aa' },
  torch: { img: 'props/prop_torch', k: 0.7, ay: 0.6, tint: '#ffffff', glow: 0.32, pool: 0.8, wall: true },
  brazier: { img: 'props/deco_gate_brazier', k: 1.2, ay: 0.98, tint: '#e8dcd8', glow: 0.72, pool: 1.2 },
  statue: { img: 'props/prop_statue', k: 1.15, ay: 0.985, tint: '#8a86b0' },
  tree: { img: 'props/deco_grave_deadtree', k: 1.2, ay: 0.975, tint: '#6a6488' },
  banner: { img: 'props/deco_gate_banner', k: 1.1, ay: 0.5, tint: '#a898a8' },
};

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

export class Renderer {
  constructor(game, stage) {
    this.game = game; this.stage = stage;
    this.canvases = [];                 // 장면을 나갈 때 놓을 캔버스
    this.pats = new Map();              // 재질|면 → { pat, k } | null
    this.propImg = new Map();           // 소품 → 밤 빛깔을 구운 캔버스
    this.fog = stage.fog; this.fogRGB = hexRGB(stage.fog);
    this.items = [];                    // [B] 깊이 정렬 목록 (재사용)
    this.nItems = 0;
    this.stats = { strips: 0, faces: 0, items: 0 };
    this.t = 0;
    this._glow = this._makeGlow();
    this._fogBand = this._makeFogBand();
    this._shadow = this._makeShadow();
    for (const m of Object.values(MATS)) if (m.tex) assets.load(m.tex);
    for (const p of Object.values(PROPS)) assets.load(p.img);
    assets.load('bg/s01_village');
    this.solidItems = stage.solids.map((s) => ({ key: 0, tie: 0, kind: 0, ref: s }));
    this.propItems = stage.props.map((p) => ({ key: 0, tie: 0, kind: 1, ref: p }));
  }
  dispose() { for (const c of this.canvases) { c.width = 0; c.height = 0; } this.canvases.length = 0; this.pats.clear(); this.propImg.clear(); }
  _keep(c) { this.canvases.push(c); return c; }
  _makeGlow() {
    const c = this._keep(mk(128, 128)), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(0.6, 'rgba(255,255,255,0.14)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return c;
  }
  _tinted(color) {     // 빛 색을 입힌 번짐 (색마다 한 장)
    this._glows ??= new Map();
    let c = this._glows.get(color);
    if (!c) { c = this._keep(mk(128, 128)); const g = c.getContext('2d'); g.drawImage(this._glow, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, 128, 128); this._glows.set(color, c); }
    return c;
  }
  _makeFogBand() {
    const c = this._keep(mk(4, 64)), g = c.getContext('2d'), [r, gg, b] = this.fogRGB, l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, `rgba(${r},${gg},${b},0)`); l.addColorStop(0.55, `rgba(${r},${gg},${b},0.75)`); l.addColorStop(1, `rgba(${r},${gg},${b},1)`);
    g.fillStyle = l; g.fillRect(0, 0, 4, 64);
    return c;
  }
  _makeShadow() {
    const c = this._keep(mk(96, 48)), g = c.getContext('2d');
    g.translate(48, 24); g.scale(1, 0.5);
    const r = g.createRadialGradient(0, 0, 4, 0, 0, 48);
    r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.6, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(-48, -48, 96, 96);
    return c;
  }
  /** 재질·면별 무늬 (밤 빛깔과 면 밝기를 미리 구운 256 px 타일). 그림이 아직 없으면 null → 단색 */
  _pat(ctx, matId, face) {
    const key = matId + '|' + face;
    let e = this.pats.get(key);
    if (e !== undefined && e !== null) return e;
    const m = MATS[matId] || MATS.cobble;
    if (!m.tex) { this.pats.set(key, false); return false; }
    const img = assets.get(m.tex);
    if (!img || !img.width) return null;
    const c = this._keep(mk(256, 256)), g = c.getContext('2d');
    g.drawImage(img, 0, 0, 256, 256);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = m.tint; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'source-over';
    const dark = 1 - m[face];
    if (dark > 0.01) { g.fillStyle = `rgba(${NIGHT[0]},${NIGHT[1]},${NIGHT[2]},${dark})`; g.fillRect(0, 0, 256, 256); }
    const pat = ctx.createPattern(c, 'repeat');
    const k = m.size / 256;
    pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
    e = { pat };
    this.pats.set(key, e);
    return e;
  }
  _flat(matId, face) {
    const m = MATS[matId] || MATS.cobble, [r, g, b] = hexRGB(m.flat), k = m[face] ?? 1;
    return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  }
  _prop(kind) {
    let c = this.propImg.get(kind);
    if (c) return c;
    const P = PROPS[kind]; if (!P) return null;
    const img = assets.get(P.img);
    if (!img || !img.width) return null;
    c = this._keep(mk(img.width, img.height));
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    if (P.tint !== '#ffffff') { g.globalCompositeOperation = 'multiply'; g.fillStyle = P.tint; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0); }
    this.propImg.set(kind, c);
    return c;
  }
  /** 깊이에 따른 안개 세기 0..0.82 (d = 초점에서 안쪽으로 떨어진 깊이) */
  fogK(d) { const k = (d - 140) / 1500; return k <= 0 ? 0 : k >= 1 ? 0.82 : 0.82 * (1 - (1 - k) * (1 - k)); }
  fogCss(k) { const [r, g, b] = this.fogRGB; return `rgba(${r},${g},${b},${k.toFixed(3)})`; }

  // ───────────────────────── 한 프레임 ─────────────────────────
  /** actors: [{ z, draw(ctx, cam, R) }] — 깊이 정렬에 낄 캐릭터·탄. sec = 영웅이 있는 구간 id (벽 자르기) */
  draw(ctx, cam, actors, sec, dt) {
    const st = this.stats; st.strips = 0; st.faces = 0;
    this.t += dt;
    this.B = ctx.getTransform();
    const W = cam.W, H = cam.H;
    this._sky(ctx, cam);
    // 벽 자르기 (마당에 들어서면 골목 벽이 가라앉는다)
    for (const p of this.stage.props) if (p.hideIn) { const on = p.hideIn.includes(sec) ? 1 : 0; p.hideK += (on - p.hideK) * Math.min(1, dt * 5); if (Math.abs(on - p.hideK) < 0.01) p.hideK = on; }
    for (const s of this.stage.solids) if (s.cutIn) { const on = s.cutIn.includes(sec) ? 1 : 0; s.cutK += (on - s.cutK) * Math.min(1, dt * 5); if (Math.abs(on - s.cutK) < 0.004) s.cutK = on; }
    // [A] 바닥 묶음
    for (const g of this.stage.floorGroups) this._floorGroup(ctx, cam, g);
    this._pools(ctx, cam);
    // [B] 깊이 정렬
    const L = this.items; let n = 0;
    for (const it of this.solidItems) {
      const s = it.ref;
      if (s.z1 <= cam.zNear || s.z0 > cam.z + FAR) continue;
      it.key = s.z1 - 0.01; it.tie = Math.abs((s.x0 + s.x1) / 2 - cam.x);
      L[n++] = it;
    }
    for (const it of this.propItems) {
      const p = it.ref;
      if (p.z <= cam.zNear + 4 || p.z > cam.z + FAR) continue;
      it.key = p.z; it.tie = -1; L[n++] = it;
    }
    for (const a of actors) { if (a.z <= cam.zNear + 4 || a.z > cam.z + FAR) continue; L[n++] = a; a.key = a.z; a.tie = -2; }
    for (let i = 0; i < 3; i++) { const c = this._cards[i]; c.key = cam.z + [430, 820, 1320][i]; c.tie = -3; L[n++] = c; }
    L.length = n;
    L.sort(byDepth);
    st.items = n;
    for (let i = 0; i < n; i++) {
      const it = L[i];
      if (it.kind === 0) this._solid(ctx, cam, it.ref);
      else if (it.kind === 1) this._propDraw(ctx, cam, it.ref);
      else if (it.kind === 3) this._card(ctx, cam, it.key);
      else it.draw(ctx, cam, this);
    }
    void W; void H;
  }
  _cards = [{ kind: 3, key: 0, tie: 0 }, { kind: 3, key: 0, tie: 0 }, { kind: 3, key: 0, tie: 0 }];

  _sky(ctx, cam) {
    const W = cam.W, H = cam.H, hz = cam.horizon;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(60, hz + 200));
    g.addColorStop(0, '#07060f'); g.addColorStop(0.6, '#1d1226'); g.addColorStop(1, '#3a1826');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const img = assets.get('bg/s01_village');
    if (img && img.width) {
      // 붉은 달과 성: 지평선 뒤 먼 층 (x 시차 4 %, 깊이로 들어가면 조금 커지고 내려온다)
      const k = Math.max(W * 1.3 / img.width, 0.44) * (1 + Math.min(0.2, Math.max(0, cam.z) * 0.00008));
      const iw = img.width * k, ih = img.height * k;
      const x = W / 2 - iw * 0.565 - (cam.x - 1200) * 0.04 + (cam.cx - W / 2) * 0.3;
      const y = hz + 190 + Math.min(40, cam.z * 0.012) - ih * 0.93;
      ctx.drawImage(img, x, y, iw, ih);
      ctx.fillStyle = 'rgba(10,6,18,0.28)'; ctx.fillRect(0, 0, W, H);
    }
    // 어두운 땅 (판이 없는 곳): 지평선은 안개 색, 가까울수록 어둡다
    const g2 = ctx.createLinearGradient(0, hz, 0, H);
    g2.addColorStop(0, this.fog); g2.addColorStop(0.5, '#120b16'); g2.addColorStop(1, '#07050b');
    ctx.fillStyle = g2; ctx.fillRect(0, Math.max(0, hz), W, H - Math.max(0, hz));
  }

  // ── [A] 바닥 묶음: 같은 높이·재질의 바닥을 한 번에 ──
  _floorGroup(ctx, cam, g) {
    const B = this.B, W = cam.W, H = cam.H, top = g.top;
    const hh = cam.h - (top - cam.y);
    // 옆면 (구덩이 안벽·계단 챌면)
    for (const s of g.slabs) this._faces(ctx, cam, s, s.top);
    if (!cam.ortho && hh <= 6) return;
    const zLo = Math.max(cam.zNear, cam.zAtY(H + 10, top)), zHi = cam.z + FAR;
    let za = Infinity, zb = -Infinity, xa = Infinity, xb = -Infinity, any = false;
    ctx.beginPath();
    for (const s of g.slabs) {
      const z0 = Math.max(s.z0, zLo), z1 = Math.min(s.z1, zHi);
      if (z1 <= z0) continue;
      const s0 = cam.s(z0), s1 = cam.s(z1);
      const ax = cam.px(s.x0, s0), bx = cam.px(s.x1, s0), cx2 = cam.px(s.x1, s1), dx = cam.px(s.x0, s1);
      if (Math.max(bx, cx2) < -2 || Math.min(ax, dx) > W + 2) continue;
      const y0 = cam.py(top, z0, s0), y1 = cam.py(top, z1, s1);
      if (y0 < -2 || y1 > H + 2) continue;
      ctx.moveTo(ax, y0); ctx.lineTo(bx, y0); ctx.lineTo(cx2, y1); ctx.lineTo(dx, y1); ctx.closePath();
      any = true;
      if (z0 < za) za = z0; if (z1 > zb) zb = z1; if (s.x0 < xa) xa = s.x0; if (s.x1 > xb) xb = s.x1;
    }
    if (!any) return;
    const P = this._pat(ctx, g.mat, 'top');
    const ya = cam.py(top, za, cam.s(za)), yb = cam.py(top, zb, cam.s(zb));
    if (!P) {
      ctx.fillStyle = this._flat(g.mat, 'top'); ctx.fill();
    } else {
      ctx.save(); ctx.clip();
      ctx.fillStyle = P.pat;
      let z = za, y = ya;
      while (z < zb - 0.01) {
        let z2 = z + Math.max(2, cam.dzForPx(z, top, STRIP));
        if (zb - z2 < 2) z2 = zb;
        const sm = cam.s((z + z2) / 2), y2 = cam.py(top, z2, cam.s(z2));
        const vs = (y - y2) / (z2 - z);
        if (vs > 1e-4) {
          const ov = 0.7 / vs;
          const x0 = Math.max(xa, cam.x - (cam.cx + 6) / sm), x1 = Math.min(xb, cam.x + (W - cam.cx + 6) / sm);
          if (x1 > x0) {
            ctx.setTransform(B.a * sm, 0, 0, -B.d * vs, B.e + B.a * (cam.cx - cam.x * sm), B.f + B.d * (y + z * vs));
            ctx.fillRect(x0, z - ov, x1 - x0, z2 - z + ov * 2);
            this.stats.strips++;
          }
        }
        z = z2; y = y2;
      }
      ctx.setTransform(B);
      ctx.restore();
      // restore 가 경로를 지우지 않는다 → 같은 경로에 안개를 덮는다
    }
    if (g.mat !== 'pit') {
      const k0 = this.fogK(za - cam.z), k1 = this.fogK(zb - cam.z);
      if (k1 > 0.02) {
        const zm = (za + zb) / 2, lg = ctx.createLinearGradient(0, ya, 0, yb), ym = cam.py(top, zm, cam.s(zm));
        lg.addColorStop(0, this.fogCss(k0)); lg.addColorStop(Math.min(1, Math.max(0, (ya - ym) / Math.max(1, ya - yb))), this.fogCss(this.fogK(zm - cam.z))); lg.addColorStop(1, this.fogCss(k1));
        ctx.fillStyle = lg; ctx.fill();
      }
    }
  }

  /** 판 하나의 보이는 옆면들 (앞면 + 카메라 쪽 옆면). top = 지금 윗면 높이 (잘린 벽은 낮다) */
  _faces(ctx, cam, s, top) {
    if (s.z1 <= cam.zNear) return;
    if (cam.x < s.x0) for (const g of s.segL) if (g.base < top) this._side(ctx, cam, s.x0, g.a, g.b, g.base, top, s.mat);
    if (cam.x > s.x1) for (const g of s.segR) if (g.base < top) this._side(ctx, cam, s.x1, g.a, g.b, g.base, top, s.mat);
    if (s.z0 > cam.zNear) for (const g of s.segF) if (g.base < top) this._front(ctx, cam, g.a, g.b, s.z0, g.base, top, s);
  }
  _front(ctx, cam, xa, xb, z, base, top, slab) {
    const B = this.B, s = cam.s(z), W = cam.W, H = cam.H;
    const X0 = cam.px(xa, s), X1 = cam.px(xb, s), Y0 = cam.py(top, z, s), Y1 = cam.py(base, z, s);
    if (X1 < 0 || X0 > W || Y1 < 0 || Y0 > H || X1 - X0 < 0.5) return;
    const P = this._pat(ctx, slab.mat, 'front');
    if (P) {
      ctx.fillStyle = P.pat;
      ctx.setTransform(B.a * s, 0, 0, -B.d * s, B.e + B.a * (cam.cx - cam.x * s), B.f + B.d * (cam.gy(z, s) + cam.y * s));
      ctx.fillRect(xa, base, xb - xa, top - base);
      ctx.setTransform(B);
    } else { ctx.fillStyle = this._flat(slab.mat, 'front'); ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0); }
    this.stats.faces++;
    if (slab.deco === 'house' && top - base > 200) this._house(ctx, cam, slab, xa, xb, z, base, top, s);
    // 바닥과 만나는 곳의 그늘 + 윗모서리 빛
    const hpx = Y1 - Y0;
    if (hpx > 10) { ctx.fillStyle = 'rgba(4,3,10,0.3)'; ctx.fillRect(X0, Y1 - Math.min(hpx * 0.3, 14 * s), X1 - X0, Math.min(hpx * 0.3, 14 * s)); }
    if (slab.kind !== 'wall' || slab.cutK > 0.5) { ctx.fillStyle = 'rgba(190,200,255,0.16)'; ctx.fillRect(X0, Y0, X1 - X0, Math.max(1, 1.6 * s)); }
    const fk = this.fogK(z - cam.z);
    if (fk > 0.02) { ctx.fillStyle = this.fogCss(fk); ctx.fillRect(X0, Y0 - 0.5, X1 - X0, Y1 - Y0 + 1); }
  }
  /** 집 정면 장식: 창(불 켜진 것·꺼진 것), 문, 지붕 — 세계 좌표에 고정된 격자 */
  _house(ctx, cam, slab, xa, xb, z, base, top, s) {
    const X = (x) => cam.px(x, s), Y = (y) => cam.py(y, z, s);
    const hgt = top - base, seed = slab.id * 7.3;
    // 지붕 (정면 위 사다리꼴)
    ctx.fillStyle = '#0d0a16';
    ctx.beginPath(); ctx.moveTo(X(xa - 10), Y(top)); ctx.lineTo(X(xb + 10), Y(top)); ctx.lineTo(X(xb - 34), Y(top + 62)); ctx.lineTo(X(xa + 34), Y(top + 62)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1b1424'; ctx.fillRect(X(xa - 10), Y(top) - 1, (xb - xa + 20) * s, Math.max(1.5, 5 * s));
    if (hash(seed) > 0.4) { const cx0 = xa + 40 + hash(seed + 1) * (xb - xa - 110); ctx.fillStyle = '#0d0a16'; ctx.fillRect(X(cx0), Y(top + 96), 26 * s, 60 * s); }
    const rows = hgt > 420 ? 3 : 2;
    for (let r = 0; r < rows; r++) {
      const wy = base + 150 + r * 118;
      if (wy + 70 > top - 10) break;
      for (let wx = Math.ceil((xa + 40) / 112) * 112; wx + 50 < xb - 20; wx += 112) {
        const h = hash(wx * 0.37 + r * 9.1 + seed), lit = h > 0.52;
        const x0 = X(wx), y0 = Y(wy + 70), w = 50 * s, hh = 70 * s;
        ctx.fillStyle = '#0c0914'; ctx.fillRect(x0 - 3 * s, y0 - 3 * s, w + 6 * s, hh + 6 * s);
        if (lit) {
          ctx.fillStyle = h > 0.8 ? '#ffb24a' : '#e07a2a'; ctx.fillRect(x0, y0, w, hh);
          ctx.fillStyle = 'rgba(20,10,10,0.75)'; ctx.fillRect(x0 + w / 2 - s, y0, 2 * s, hh); ctx.fillRect(x0, y0 + hh * 0.45, w, 2 * s);
          const ga = ctx.globalAlpha; ctx.globalAlpha = 0.34; ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(this._tinted('#ff9a3a'), x0 - w * 1.1, y0 - hh * 0.8, w * 3.2, hh * 2.6);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = ga;
        } else { ctx.fillStyle = '#141826'; ctx.fillRect(x0, y0, w, hh); }
      }
    }
    // 문
    const dx = xa + 60 + hash(seed + 3) * Math.max(0, xb - xa - 190);
    ctx.fillStyle = '#0c0914'; ctx.fillRect(X(dx - 4), Y(base + 112), 72 * s, 112 * s);
    ctx.fillStyle = '#2a1c18'; ctx.fillRect(X(dx), Y(base + 106), 64 * s, 106 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(X(dx + 31), Y(base + 106), 2 * s, 106 * s);
  }
  _side(ctx, cam, xf, za, zb, base, top, mat) {
    const B = this.B, W = cam.W, H = cam.H;
    za = Math.max(za, cam.zNear); zb = Math.min(zb, cam.z + FAR);
    if (zb <= za) return;
    const dxw = xf - cam.x;
    // 화면 밖으로 나간 가까운 쪽은 잘라 낸다
    if (!cam.ortho) {
      const lim = dxw < 0 ? -(cam.cx + 30) / dxw : (W - cam.cx + 30) / dxw;      // 이 배율보다 크면 화면 밖
      if (lim > 0) { const zc = cam.zAtS(lim); if (zc > za) za = zc; }
      if (zb <= za) return;
    }
    const sa = cam.s(za), sb = cam.s(zb);
    const xa = cam.px(xf, sa), xb = cam.px(xf, sb);
    if (Math.abs(xb - xa) < 0.6) return;
    if (Math.max(xa, xb) < 0 || Math.min(xa, xb) > W) return;
    const ta = cam.py(top, za, sa), tb = cam.py(top, zb, sb), ba = cam.py(base, za, sa), bb = cam.py(base, zb, sb);
    if (Math.max(ba, bb) < 0 || Math.min(ta, tb) > H) return;
    ctx.beginPath(); ctx.moveTo(xa, ta); ctx.lineTo(xb, tb); ctx.lineTo(xb, bb); ctx.lineTo(xa, ba); ctx.closePath();
    const P = this._pat(ctx, mat, 'side');
    this.stats.faces++;
    if (!P) { ctx.fillStyle = this._flat(mat, 'side'); ctx.fill(); }
    else {
      ctx.save(); ctx.clip();
      ctx.fillStyle = P.pat;
      let z = za, x = xa, s = sa;
      while (z < zb - 0.01) {
        let z2 = z + Math.max(3, cam.dzForPxX(z, xf, STRIP + 2));
        if (zb - z2 < 3) z2 = zb;
        const s2 = cam.s(z2), x2 = cam.px(xf, s2);
        const us = (x2 - x) / (z2 - z);
        if (Math.abs(us) > 1e-5) {
          const ov = 0.7 / Math.abs(us);
          ctx.setTransform(B.a * us, 0, 0, -B.d * s, B.e + B.a * (x - z * us), B.f + B.d * (cam.gy(z, s) + cam.y * s));
          ctx.fillRect(z - ov, base - 2, z2 - z + ov * 2, top - base + 4);
          this.stats.strips++;
        }
        z = z2; x = x2; s = s2;
      }
      ctx.setTransform(B);
      ctx.restore();
    }
    const k0 = this.fogK(za - cam.z), k1 = this.fogK(zb - cam.z);
    if (k1 > 0.02) {
      const lg = ctx.createLinearGradient(xa, 0, xb, 0);
      lg.addColorStop(0, this.fogCss(k0)); lg.addColorStop(0.5, this.fogCss(this.fogK(cam.zAtS((sa + sb) / 2) - cam.z))); lg.addColorStop(1, this.fogCss(k1));
      ctx.fillStyle = lg; ctx.fill();
    }
  }
  /** 솟은 판 (단상·상자·계단·벽): 옆면 → 윗면 */
  _solid(ctx, cam, s) {
    const top = s.cutK > 0 ? s.top + (s.floorY + 22 - s.top) * s.cutK : s.top;
    this._faces(ctx, cam, s, top);
    const hh = cam.h - (top - cam.y);
    if (hh <= 6 && !cam.ortho) return;
    const W = cam.W, H = cam.H, B = this.B;
    const z0 = Math.max(s.z0, cam.zNear, cam.zAtY(H + 10, top)), z1 = Math.min(s.z1, cam.z + FAR);
    if (z1 <= z0) return;
    const s0 = cam.s(z0), s1 = cam.s(z1);
    const ax = cam.px(s.x0, s0), bx = cam.px(s.x1, s0), cx2 = cam.px(s.x1, s1), dx = cam.px(s.x0, s1);
    if (Math.max(bx, cx2) < 0 || Math.min(ax, dx) > W) return;
    const y0 = cam.py(top, z0, s0), y1 = cam.py(top, z1, s1);
    if (y0 < 0 || y1 > H) return;
    ctx.beginPath(); ctx.moveTo(ax, y0); ctx.lineTo(bx, y0); ctx.lineTo(cx2, y1); ctx.lineTo(dx, y1); ctx.closePath();
    const P = this._pat(ctx, s.mat, 'top');
    if (!P) { ctx.fillStyle = this._flat(s.mat, 'top'); ctx.fill(); }
    else {
      ctx.save(); ctx.clip(); ctx.fillStyle = P.pat;
      let z = z0, y = y0;
      while (z < z1 - 0.01) {
        let z2 = z + Math.max(2, cam.dzForPx(z, top, STRIP));
        if (z1 - z2 < 2) z2 = z1;
        const sm = cam.s((z + z2) / 2), y2 = cam.py(top, z2, cam.s(z2)), vs = (y - y2) / (z2 - z);
        if (vs > 1e-4) {
          const ov = 0.7 / vs;
          ctx.setTransform(B.a * sm, 0, 0, -B.d * vs, B.e + B.a * (cam.cx - cam.x * sm), B.f + B.d * (y + z * vs));
          ctx.fillRect(s.x0 - 4, z - ov, s.x1 - s.x0 + 8, z2 - z + ov * 2);
          this.stats.strips++;
        }
        z = z2; y = y2;
      }
      ctx.setTransform(B); ctx.restore();
    }
    const fk = this.fogK((z0 + z1) / 2 - cam.z);
    if (fk > 0.02) { ctx.fillStyle = this.fogCss(fk); ctx.fill(); }
    if (s.tag === 'crate') { ctx.strokeStyle = 'rgba(20,10,6,0.7)'; ctx.lineWidth = Math.max(1, 3 * s0); ctx.stroke(); }
  }
  // ── 빛 웅덩이 (바닥 위, 더하기) ──
  _pools(ctx, cam) {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.stage.props) {
      const P = PROPS[p.kind];
      if (!p.light || !P?.pool || p.hideK > 0.5 || p.z <= cam.zNear + 20 || p.z > cam.z + 2200) continue;
      const s = cam.s(p.z), gyv = this.stage.topAt(p.x + (P.wall ? (p.flip ? -30 : 30) : 0), p.z, true);
      const X = cam.px(p.x + (P.wall ? (p.flip ? -46 : 46) : 0), s), Y = cam.py(gyv > WALL / 2 || gyv <= PIT_Y ? 0 : gyv, p.z, s);
      const fl = 0.9 + 0.1 * Math.sin(this.t * 9 + p.x) * (P.wall || p.kind === 'brazier' ? 1 : 0.3);
      const rw = 250 * P.pool * s * fl, rh = rw * cam.squash(p.z) * 1.05;
      if (X + rw < 0 || X - rw > cam.W || Y - rh > cam.H) continue;
      ctx.globalAlpha = 0.5 * (1 - this.fogK(p.z - cam.z));
      ctx.drawImage(this._tinted(p.light), X - rw, Y - rh, rw * 2, rh * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  _propDraw(ctx, cam, p) {
    const P = PROPS[p.kind]; if (!P || p.hideK >= 1) return;
    const img = this._prop(p.kind);
    if (p.hideK > 0) { ctx.save(); ctx.globalAlpha = 1 - p.hideK; this._propBody(ctx, cam, p, P, img); ctx.restore(); return; }
    this._propBody(ctx, cam, p, P, img);
  }
  _propBody(ctx, cam, p, P, img) {
    const s = cam.s(p.z), X = cam.px(p.x, s), Y = cam.py(p.y, p.z, s);
    const k = P.k * p.scale * s;
    const w = (img ? img.width : 60) * k, h = (img ? img.height : 120) * k;
    if (X + w < 0 || X - w > cam.W || Y - h > cam.H + 40 || Y + h < -40) return;
    if (!P.wall && p.kind !== 'banner') { ctx.globalAlpha = 0.5; ctx.drawImage(this._shadow, X - w * 0.42, Y - w * 0.13, w * 0.84, w * 0.26); ctx.globalAlpha = 1 - p.hideK; }
    if (img) {
      if (p.flip) { ctx.save(); ctx.translate(X, 0); ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, Y - h * P.ay, w, h); ctx.restore(); }
      else ctx.drawImage(img, X - w / 2, Y - h * P.ay, w, h);
    } else { ctx.fillStyle = '#1a1622'; ctx.fillRect(X - w / 4, Y - h, w / 2, h); }
    const fk = this.fogK(p.z - cam.z);
    if (p.light && P.glow) {
      const fl = 0.86 + 0.14 * Math.sin(this.t * 11 + p.x * 0.7) * (p.kind === 'lamp' ? 0.25 : 1);
      const gx = X, gyy = Y - h * P.ay + h * (1 - P.glow) , r = 120 * s * fl;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 * (1 - fk * 0.6) * (1 - p.hideK);
      ctx.drawImage(this._tinted(p.light), gx - r, gyy - r, r * 2, r * 2);
      ctx.globalAlpha = 1 - p.hideK; ctx.globalCompositeOperation = 'source-over';
    }
  }
  /** 안개 판: 깊이 z 에서 통로를 가로지르는 반투명 판 → 그보다 먼 것(캐릭터 포함)이 흐려진다 */
  _card(ctx, cam, z) {
    const s = cam.s(z); if (s <= 0.05) return;
    const sec = this.stage.sectionAt(cam.x, z);
    const X0 = Math.max(0, cam.px(sec.x0, s)), X1 = Math.min(cam.W, cam.px(sec.x1, s));
    if (X1 <= X0) return;
    const gyv = this.stage.topAt(cam.x, z, true);
    const Y = cam.py(gyv > WALL / 2 || gyv <= PIT_Y ? cam.y : gyv, z, s), hh = 430 * s;
    ctx.globalAlpha = 0.2;
    ctx.drawImage(this._fogBand, 0, 0, 4, 64, X0, Y - hh, X1 - X0, hh);
    ctx.globalAlpha = 1;
  }
  /** 땅 그림자: 발밑 땅(ground)에 떨어진다. alt = 땅에서 떠 있는 높이 → 작고 옅어진다 */
  shadow(ctx, cam, x, z, ground, alt, r) {
    if (ground <= PIT_Y + 1) return;
    const s = cam.s(z), X = cam.px(x, s), Y = cam.py(ground, z, s);
    const k = 1 - Math.min(1, alt / 280) * 0.5, w = r * 2 * s * k;
    const sq = cam.squash(z) * 0.95;
    ctx.globalAlpha = 0.62 * (1 - Math.min(1, alt / 320) * 0.55);
    ctx.drawImage(this._shadow, X - w / 2, Y - w * sq / 2, w, w * sq);
    ctx.globalAlpha = 1;
  }
  glow(ctx, X, Y, r, color, a = 1) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a;
    ctx.drawImage(this._tinted(color), X - r, Y - r, r * 2, r * 2);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

function byDepth(a, b) { return b.key - a.key || b.tie - a.tie; }
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
