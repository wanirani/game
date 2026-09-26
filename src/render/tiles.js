// 타일 렌더러: 스테이지 텍스처(Kling 생성 tex/*.webp)로 벽/바닥을 칠하고, 경계 음영·윗면 하이라이트·이끼/눈 장식을 얹어
// 방 전체를 오프스크린 캔버스(청크)에 미리 구워 둔다. 타일이 바뀌면(부서진 벽) 해당 청크만 다시 굽는다.
// new TileRenderer(stage, map) → draw(ctx, cam), drawDecor(ctx, cam, t), invalidate()
import { TILE } from '../core/game.js';
import { T } from '../core/physics.js';
import { assets } from '../core/assets.js';
import { RNG, hashStr, rgba, shade, mix, TAU } from '../core/math.js';

const CHUNK = 16; // 타일 단위 청크 크기
const DEPTH_R = 3; // 깊이 음영: 빈칸까지의 거리를 찾는 반경(타일)
// 원경이 트인 하늘/달인 테마: 절차적 창문('W')이 허공에 떠 보이므로 그리지 않는다
const OPEN_SKY_THEMES = new Set(['village', 'town', 'graveyard', 'gate', 'spire', 'throne', 'abyss']);

export const TILE_STYLES = {
  // stage.tileStyle → 색/장식
  wood:   { base: '#3a2616', edge: '#1a0e06', top: '#6a4a2a', topDeco: null },
  stone:  { base: '#3a3640', edge: '#15121a', top: '#6a6470', topDeco: null },
  moss:   { base: '#2e3430', edge: '#101410', top: '#4a6a3a', topDeco: 'moss' },
  marble: { base: '#3a2a2e', edge: '#140a0e', top: '#8a6a60', topDeco: 'gold' },
  bone:   { base: '#4a4436', edge: '#1a160e', top: '#a89a7a', topDeco: 'skulls' },
  lab:    { base: '#26342a', edge: '#0a140c', top: '#4a7a5a', topDeco: 'slime' },
  wet:    { base: '#1e2a36', edge: '#080e14', top: '#3a5a6a', topDeco: 'wet' },
  brass:  { base: '#4a3a1e', edge: '#1a1206', top: '#b89040', topDeco: 'rivets' },
  ice:    { base: '#3a5a6a', edge: '#102030', top: '#dff4ff', topDeco: 'snow' },
  blood:  { base: '#2a0e12', edge: '#0e0204', top: '#7a1a24', topDeco: 'gold' },
  abyss:  { base: '#1e0e26', edge: '#08020c', top: '#6a2a7a', topDeco: 'glow' },
  dirt:   { base: '#2e2418', edge: '#100a06', top: '#4a3a24', topDeco: 'grass' },
};

// 테마별 배경 장식 소품 (Blender 렌더: assets/props/<id>.png). a:'floor'|'ceil', w/h: 그릴 크기(px), wt: 배치 가중치, dim: 어둡게 누르는 정도
const D = (id, w, h, a = 'floor', wt = 1, dim = 0.5) => ({ id, w, h, a, wt, dim });
export const DECOR_SETS = {
  village: [D('deco_village_well', 144, 144), D('deco_village_cart', 192, 120), D('deco_village_fence', 192, 72, 'floor', 2), D('deco_village_haybale', 96, 72, 'floor', 2), D('deco_village_lamppost', 64, 192), D('prop_barrel', 72, 72, 'floor', 2), D('prop_crate', 72, 72)],
  town: [D('deco_village_well', 144, 144), D('deco_village_cart', 192, 120), D('deco_village_haybale', 96, 72), D('deco_village_lamppost', 64, 192, 'floor', 2), D('prop_barrel', 72, 72, 'floor', 2), D('prop_crate', 72, 72)],
  graveyard: [D('deco_grave_tomb1', 72, 96, 'floor', 3), D('deco_grave_tomb2', 64, 112, 'floor', 3), D('deco_grave_tomb3', 96, 80, 'floor', 2), D('deco_grave_angel', 96, 192), D('deco_grave_deadtree', 192, 288), D('deco_grave_fence', 192, 96, 'floor', 2)],
  gate: [D('deco_gate_banner', 64, 192, 'ceil', 2), D('deco_gate_portcullis', 144, 192), D('deco_gate_brazier', 72, 120, 'floor', 2), D('prop_gargoyle', 96, 120)],
  arena: [D('deco_gate_banner', 64, 192, 'ceil', 2), D('deco_gate_brazier', 72, 120, 'floor', 2)],
  // 갑옷 장식은 갑옷 적(armor_knight/spear_guard)과 헷갈리지 않도록 빈도를 낮추고 더 어둡게
  hall: [D('deco_hall_armor', 72, 160, 'floor', 1, 0.66), D('deco_hall_vase', 64, 96, 'floor', 2), D('deco_hall_bust', 64, 120, 'floor', 2), D('deco_hall_curtain', 144, 288, 'ceil', 2), D('deco_gate_banner', 64, 192, 'ceil'), D('prop_pillar', 72, 192)],
  catacombs: [D('deco_cata_bonepile', 144, 72, 'floor', 3), D('deco_cata_skullpile', 96, 80, 'floor', 2), D('deco_cata_sarcophagus', 192, 96, 'floor', 2), D('deco_cata_urn', 56, 80, 'floor', 2)],
  library: [D('deco_lib_desk', 144, 96, 'floor', 2), D('deco_lib_globe', 72, 120), D('deco_lib_bookstack', 72, 72, 'floor', 3), D('deco_lib_ladder', 64, 240), D('prop_bookshelf', 128, 192, 'floor', 3)],
  alchemy: [D('deco_lab_alembic', 120, 144, 'floor', 2), D('deco_lab_cauldron', 120, 96, 'floor', 2), D('deco_lab_flaskrack', 144, 120, 'floor', 2), D('deco_lab_tesla', 96, 192), D('prop_vat', 128, 192, 'floor', 2)],
  waterway: [D('deco_water_grate', 144, 144, 'floor', 2), D('deco_water_chain', 32, 240, 'ceil', 3), D('deco_water_pipe', 192, 96, 'floor', 2), D('deco_water_barrel', 72, 96, 'floor', 2)],
  clock: [D('deco_clock_pendulum', 96, 288, 'ceil', 2), D('deco_clock_face', 192, 192), D('deco_clock_bell', 120, 120, 'ceil'), D('prop_gear', 192, 192, 'floor', 2)],
  spire: [D('deco_ice_crystal', 96, 144, 'floor', 3), D('deco_ice_statue', 96, 176, 'floor', 2), D('deco_ice_icicles', 192, 96, 'ceil', 3)],
  chapel: [D('deco_chapel_pew', 192, 80, 'floor', 3), D('deco_chapel_altar', 192, 144), D('deco_chapel_window', 144, 288, 'floor', 2), D('deco_chapel_candles', 96, 96, 'floor', 2)],
  throne: [D('deco_throne_chair', 192, 240), D('deco_throne_statue', 96, 224, 'floor', 2), D('deco_throne_candelabra', 96, 224, 'floor', 2), D('deco_hall_curtain', 144, 288, 'ceil', 2)],
  abyss: [D('deco_abyss_crystal', 96, 160, 'floor', 3), D('deco_abyss_spire', 96, 240, 'floor', 2), D('deco_abyss_eye', 120, 120, 'floor')],
};
// 장식이 게임 요소를 가리지 않도록 마커 주변은 비움
const DECOR_BLOCK = new Set(['D', 'S', 'G', '$', 'N', 'X', 'P', '@', 'H', 'K']);

export class TileRenderer {
  constructor(stage, map) {
    this.stage = stage; this.map = map;
    this.style = TILE_STYLES[stage.tileStyle] || TILE_STYLES.stone;
    this.chunks = new Map();
    this.version = -1;
    this.dirty = new Set();
    this.props = this.placeProps();
    this.darkCache = new Map();
  }
  /** 바닥/천장 표면에 테마 소품을 결정론적으로 배치 */
  placeProps() {
    const set = DECOR_SETS[this.stage.theme];
    const m = this.map;
    if (!set || !m) return [];
    const rng = new RNG(hashStr(this.stage.id + ':' + m.w + 'x' + m.h));
    const blocked = new Set();
    for (const mk of m.markers) if (DECOR_BLOCK.has(mk.ch)) for (let d = -3; d <= 3; d++) blocked.add(mk.tx + d);
    const solid = (tx, ty) => { const t = m.typeAt(tx, ty); return t === T.SOLID || t === T.BREAK; };
    const empty = (tx, ty) => m.typeAt(tx, ty) === T.EMPTY && tx >= 0 && tx < m.w && ty >= 0;
    const out = [];
    const total = set.reduce((a, d) => a + d.wt, 0);
    const pickD = (a) => {
      const list = set.filter((d) => d.a === a);
      if (!list.length) return null;
      let r = rng.next() * list.reduce((s, d) => s + d.wt, 0);
      for (const d of list) { r -= d.wt; if (r <= 0) return d; }
      return list[0];
    };
    let lastFloor = -99, lastCeil = -99;
    for (let tx = 1; tx < m.w - 1; tx++) {
      if (blocked.has(tx)) continue;
      for (let ty = 1; ty < m.h; ty++) {
        // 바닥
        if (empty(tx, ty) && solid(tx, ty + 1) && tx - lastFloor > 5 && rng.next() < 0.16) {
          const d = pickD('floor');
          if (!d) continue;
          const wt = Math.ceil(d.w / TILE), ht = Math.ceil(d.h / TILE);
          let ok = true;
          for (let x = tx; x < tx + wt && ok; x++) { if (!solid(x, ty + 1)) ok = false; for (let y = ty - ht + 1; y <= ty && ok; y++) if (!empty(x, y)) ok = false; }
          if (ok) { out.push({ d, x: tx * TILE + (wt * TILE - d.w) / 2, y: (ty + 1) * TILE - d.h }); lastFloor = tx + wt; }
        }
        // 천장 (위가 벽, 아래로 충분히 빈 공간)
        if (empty(tx, ty) && solid(tx, ty - 1) && tx - lastCeil > 6 && rng.next() < 0.12) {
          const d = pickD('ceil');
          if (!d) continue;
          const ht = Math.ceil(d.h / TILE) + 2;
          let ok = true;
          for (let y = ty; y < ty + ht && ok; y++) if (!empty(tx, y)) ok = false;
          if (ok) { out.push({ d, x: tx * TILE + TILE / 2 - d.w / 2, y: ty * TILE }); lastCeil = tx; }
        }
      }
    }
    return out;
  }
  /** 배경용으로 채도를 낮추고 어둡게 톤다운한 소품 이미지 (캐시) — 적·파괴 가능한 오브젝트와 구분되게 */
  darkProp(id, w, h, dim = 0.5) {
    const key = id + w + 'x' + h + ':' + dim;
    let c = this.darkCache.get(key);
    if (c) return c;
    const img = assets.get('props/' + id);
    if (!img) return null;
    c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, w, h);
    try {
      // 채도 55% 감소 (알파는 그대로)
      const data = g.getImageData(0, 0, w, h), px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const l = px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11;
        px[i] += (l - px[i]) * 0.55; px[i + 1] += (l - px[i + 1]) * 0.55; px[i + 2] += (l - px[i + 2]) * 0.55;
      }
      g.putImageData(data, 0, 0);
    } catch { /* 캔버스 오염 등으로 픽셀 접근 불가 → 어둡게만 */ }
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(this.style.edge, dim);
    g.fillRect(0, 0, w, h);
    this.darkCache.set(key, c);
    return c;
  }
  invalidate(tx, ty) {
    if (tx === undefined) { this.chunks.clear(); return; }
    // 깊이 음영 반경만큼 떨어진 인접 청크까지 (청크 크기 > DEPTH_R 이므로 -R/0/+R 만 보면 충분)
    for (let dy = -DEPTH_R; dy <= DEPTH_R; dy += DEPTH_R) for (let dx = -DEPTH_R; dx <= DEPTH_R; dx += DEPTH_R) {
      this.chunks.delete(`${Math.floor((tx + dx) / CHUNK)},${Math.floor((ty + dy) / CHUNK)}`);
    }
  }
  chunk(cx, cy) {
    const key = `${cx},${cy}`;
    let c = this.chunks.get(key);
    const texReady = !!assets.get(this.stage.tex);
    if (c && (c.tex || !texReady)) return c.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = CHUNK * TILE; canvas.height = CHUNK * TILE;
    this.bake(canvas.getContext('2d'), cx * CHUNK, cy * CHUNK);
    this.chunks.set(key, { canvas, tex: texReady });
    return canvas;
  }
  isSolid(tx, ty) {
    const m = this.map;
    if (tx < 0 || tx >= m.w || ty < 0 || ty >= m.h) return ty >= 0 && ty < m.h; // 좌우 밖은 벽으로 이어진 듯이
    const t = m.tiles[ty * m.w + tx];
    return t === T.SOLID || t === T.BREAK || (t === T.FAKE && !m.revealed.has(ty * m.w + tx));
  }
  bake(ctx, tx0, ty0) {
    const m = this.map, S = TILE, st = this.style;
    const tex = assets.get(this.stage.tex), tex2 = assets.get(this.stage.tex2 || this.stage.tex);
    const pat = tex ? ctx.createPattern(tex, 'repeat') : null;
    const pat2 = tex2 ? ctx.createPattern(tex2, 'repeat') : null;
    const rng = new RNG(hashStr(this.stage.id) + tx0 * 31 + ty0 * 17);
    for (let ty = ty0; ty < ty0 + CHUNK; ty++) {
      for (let tx = tx0; tx < tx0 + CHUNK; tx++) {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) continue;
        const idx = ty * m.w + tx;
        const t = m.tiles[idx];
        const x = (tx - tx0) * S, y = (ty - ty0) * S;
        if (t === T.SOLID || t === T.BREAK || (t === T.FAKE && !m.revealed.has(idx))) {
          const alt = m.alt[idx];
          // 텍스처 (월드 좌표 기준으로 정렬되도록 패턴 이동)
          const p = alt ? pat2 : pat;
          if (p) {
            p.setTransform?.(new DOMMatrix().translateSelf(-((tx0 * S) % 384), -((ty0 * S) % 384)).scaleSelf(0.75, 0.75));
            ctx.fillStyle = p;
            ctx.fillRect(x, y, S, S);
            ctx.fillStyle = rgba(st.base, 0.45); ctx.fillRect(x, y, S, S);
          } else {
            ctx.fillStyle = alt ? shade(st.base, -0.15) : st.base; ctx.fillRect(x, y, S, S);
            // 벽돌 무늬
            ctx.strokeStyle = rgba(st.edge, 0.6); ctx.lineWidth = 1;
            const off = (ty % 2) * (S / 2);
            ctx.beginPath();
            ctx.moveTo(x, y + S / 2); ctx.lineTo(x + S, y + S / 2);
            ctx.moveTo(x + ((off) % S), y); ctx.lineTo(x + ((off) % S), y + S / 2);
            ctx.moveTo(x + ((off + S / 2) % S), y + S / 2); ctx.lineTo(x + ((off + S / 2) % S), y + S);
            ctx.stroke();
          }
          // (깊이 음영은 청크 전체를 다 그린 뒤 bakeDepth 에서 부드럽게)
          // 윗면 (노출)
          if (!this.isSolid(tx, ty - 1)) {
            const g = ctx.createLinearGradient(0, y, 0, y + 12);
            g.addColorStop(0, st.top); g.addColorStop(1, rgba(st.top, 0));
            ctx.fillStyle = g; ctx.fillRect(x, y, S, 12);
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y, S, 2);
            this.topDeco(ctx, x, y, st.topDeco, rng);
          }
          // 경계선
          ctx.fillStyle = rgba(st.edge, 0.9);
          if (!this.isSolid(tx, ty + 1)) ctx.fillRect(x, y + S - 3, S, 3);
          if (!this.isSolid(tx - 1, ty)) { ctx.fillRect(x, y, 3, S); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 3, y, 2, S); ctx.fillStyle = rgba(st.edge, 0.9); }
          if (!this.isSolid(tx + 1, ty)) ctx.fillRect(x + S - 3, y, 3, S);
          // 부서지는 벽: 미세한 균열 (눈썰미 좋은 플레이어를 위한 힌트)
          if (t === T.BREAK) {
            ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.moveTo(x + 12, y + 8); ctx.lineTo(x + 20, y + 22); ctx.lineTo(x + 16, y + 34); ctx.moveTo(x + 20, y + 22); ctx.lineTo(x + 32, y + 26); ctx.stroke();
          }
        } else if (t === T.ONEWAY) {
          // 발판: 나무/돌 선반
          const pg = ctx.createLinearGradient(0, y, 0, y + 14);
          pg.addColorStop(0, shade(st.top, 0.1)); pg.addColorStop(1, shade(st.base, -0.3));
          ctx.fillStyle = pg; ctx.fillRect(x, y, S, 12);
          ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(x, y, S, 2);
          ctx.fillStyle = rgba(st.edge, 0.9); ctx.fillRect(x, y + 11, S, 2);
          // 받침대
          if (tx % 2 === 0) { ctx.fillStyle = rgba(st.edge, 0.7); ctx.beginPath(); ctx.moveTo(x + 8, y + 12); ctx.lineTo(x + 16, y + 12); ctx.lineTo(x + 10, y + 26); ctx.fill(); }
        } else if (t === T.SPIKE) {
          ctx.fillStyle = '#8a8a96';
          for (let i = 0; i < 4; i++) {
            ctx.beginPath(); ctx.moveTo(x + i * 12, y + S); ctx.lineTo(x + i * 12 + 6, y + S - 26); ctx.lineTo(x + i * 12 + 12, y + S); ctx.fill();
          }
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          for (let i = 0; i < 4; i++) ctx.fillRect(x + i * 12 + 5, y + S - 24, 1.5, 12);
          ctx.fillStyle = '#3a3a44'; ctx.fillRect(x, y + S - 5, S, 5);
        }
      }
    }
    this.bakeDepth(ctx, tx0, ty0);
  }
  /** 깊이 음영용 벽 판정: 방 위아래 바깥도 벽이 이어진 것으로 본다 */
  depthSolid(tx, ty) {
    if (ty < 0 || ty >= this.map.h) return true;
    return this.isSolid(tx, ty);
  }
  /**
   * 깊이 음영: 가장 가까운 빈칸까지의 거리로 벽 안쪽을 점점 어둡게.
   * 타일당 1픽셀 알파맵(청크 + 테두리 1칸)을 만들어 부드럽게(쌍선형) 확대하고, 벽 타일 영역으로만 잘라 그린다.
   * → 타일 단위의 딱딱한 검은 사각형(구멍·격자처럼 보이던 문제) 대신 매끄러운 그라데이션.
   */
  bakeDepth(ctx, tx0, ty0) {
    const m = this.map, S = TILE, R = DEPTH_R, N = CHUNK + 2;
    if (!this.depthCtx) {
      const c = document.createElement('canvas'); c.width = N; c.height = N;
      this.depthCtx = c.getContext('2d');
    }
    const g = this.depthCtx;
    const img = g.createImageData(N, N);
    let any = false;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const tx = tx0 + i - 1, ty = ty0 + j - 1;
        if (!this.depthSolid(tx, ty)) continue;
        // 상하좌우에 빈칸이 있으면 표면 타일 → 음영 없음
        if (!this.depthSolid(tx + 1, ty) || !this.depthSolid(tx - 1, ty) || !this.depthSolid(tx, ty + 1) || !this.depthSolid(tx, ty - 1)) continue;
        let q = (R + 1) * (R + 1);
        for (let dy = -R; dy <= R; dy++) {
          for (let dx = -R; dx <= R; dx++) {
            const d = dx * dx + dy * dy;
            if (d < q && !this.depthSolid(tx + dx, ty + dy)) q = d;
          }
        }
        const a = Math.min(0.5, (Math.sqrt(q) - 1) * 0.18);
        if (a > 0) { img.data[(j * N + i) * 4 + 3] = Math.round(a * 255); any = true; }
      }
    }
    if (!any) return;
    g.putImageData(img, 0, 0);
    ctx.save();
    ctx.beginPath();
    for (let ty = Math.max(0, ty0); ty < Math.min(m.h, ty0 + CHUNK); ty++) {
      for (let tx = Math.max(0, tx0); tx < Math.min(m.w, tx0 + CHUNK); tx++) {
        if (this.isSolid(tx, ty)) ctx.rect((tx - tx0) * S, (ty - ty0) * S, S, S);
      }
    }
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    // 알파맵 픽셀 i 의 중심 = 타일 (tx0 + i - 1) 의 중심
    ctx.drawImage(g.canvas, -S, -S, N * S, N * S);
    ctx.restore();
  }
  topDeco(ctx, x, y, kind, rng) {
    switch (kind) {
      case 'grass': case 'moss':
        ctx.fillStyle = kind === 'grass' ? '#3a5a2a' : '#4a7a3a';
        for (let i = 0; i < 6; i++) { const gx = x + rng.range(0, 46); ctx.fillRect(gx, y - rng.range(2, 7), 2, 8); }
        break;
      case 'snow':
        ctx.fillStyle = '#f0f8ff';
        ctx.beginPath(); ctx.moveTo(x, y + 4);
        for (let i = 0; i <= 4; i++) ctx.quadraticCurveTo(x + i * 12 - 6, y - rng.range(2, 6), x + i * 12, y + 2);
        ctx.lineTo(x + 48, y + 7); ctx.lineTo(x, y + 7); ctx.fill();
        break;
      case 'skulls':
        if (rng.next() < 0.2) { ctx.fillStyle = '#d8ccb0'; ctx.beginPath(); ctx.arc(x + 24, y - 5, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#1a140a'; ctx.fillRect(x + 20, y - 6, 3, 3); ctx.fillRect(x + 25, y - 6, 3, 3); }
        break;
      case 'gold':
        ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(x, y + 3, 48, 2);
        break;
      case 'slime':
        ctx.fillStyle = 'rgba(100,255,100,0.35)';
        if (rng.next() < 0.3) { ctx.beginPath(); ctx.ellipse(x + 24, y + 2, 10, 3, 0, 0, TAU); ctx.fill(); ctx.fillRect(x + 22, y + 2, 3, rng.range(6, 16)); }
        break;
      case 'wet':
        ctx.fillStyle = 'rgba(120,200,255,0.25)'; ctx.fillRect(x, y + 1, 48, 3);
        break;
      case 'rivets':
        ctx.fillStyle = '#e8c070'; for (const rx of [8, 40]) { ctx.beginPath(); ctx.arc(x + rx, y + 8, 2, 0, TAU); ctx.fill(); }
        break;
      case 'glow':
        ctx.fillStyle = 'rgba(255,90,255,0.25)'; ctx.fillRect(x, y, 48, 3);
        break;
    }
  }
  draw(ctx, cam) {
    const m = this.map;
    const S = CHUNK * TILE;
    const x0 = Math.floor(cam.x / S), x1 = Math.floor((cam.x + cam.vw) / S);
    const y0 = Math.floor(cam.y / S), y1 = Math.floor((cam.y + cam.vh) / S);
    for (let cy = Math.max(0, y0); cy <= Math.min(Math.floor((m.h - 1) / CHUNK), y1); cy++) {
      for (let cx = Math.max(0, x0); cx <= Math.min(Math.floor((m.w - 1) / CHUNK), x1); cx++) {
        ctx.drawImage(this.chunk(cx, cy), cx * S, cy * S);
      }
    }
    // 방 밖(좌우)으로 이어지는 벽 표현: 방 경계 바깥을 어둡게
    ctx.fillStyle = '#050206';
    if (!m.openLeft) ctx.fillRect(-400, -400, 400, m.pxH + 800);
    if (!m.openRight) ctx.fillRect(m.pxW, -400, 400, m.pxH + 800);
  }
  /** 액체 (물/용암) — 매 프레임 애니메이션 */
  drawLiquid(ctx, cam, t, kind = 'water') {
    const m = this.map;
    const col = { water: ['rgba(40,90,160,0.55)', '#8ad0ff'], lava: ['rgba(255,80,20,0.85)', '#ffd070'], poison: ['rgba(60,180,60,0.6)', '#a0ff80'], blood: ['rgba(140,0,20,0.75)', '#ff4a5a'] }[kind] || ['rgba(40,90,160,0.55)', '#8ad0ff'];
    const tx0 = Math.max(0, Math.floor(cam.x / TILE)), tx1 = Math.min(m.w - 1, Math.floor((cam.x + cam.vw) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE)), ty1 = Math.min(m.h - 1, Math.floor((cam.y + cam.vh) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (m.tiles[ty * m.w + tx] !== T.LIQUID) continue;
      const x = tx * TILE, y = ty * TILE;
      const surface = m.tiles[(ty - 1) * m.w + tx] !== T.LIQUID;
      ctx.fillStyle = col[0];
      if (surface) {
        const w1 = Math.sin(t * 3 + tx * 0.9) * 3;
        ctx.beginPath(); ctx.moveTo(x, y + 8 + w1); ctx.quadraticCurveTo(x + 24, y + 4 - w1, x + 48, y + 8 + Math.sin(t * 3 + (tx + 1) * 0.9) * 3); ctx.lineTo(x + 48, y + 48); ctx.lineTo(x, y + 48); ctx.fill();
        ctx.strokeStyle = col[1]; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y + 8 + w1); ctx.quadraticCurveTo(x + 24, y + 4 - w1, x + 48, y + 8 + Math.sin(t * 3 + (tx + 1) * 0.9) * 3); ctx.stroke();
        ctx.globalAlpha = 1;
      } else ctx.fillRect(x, y, TILE, TILE);
      // 폭포(좌우가 액체가 아닌 좁은 기둥): 흘러내리는 물줄기
      const L = m.tiles[ty * m.w + tx - 1] === T.LIQUID, R = m.tiles[ty * m.w + tx + 1] === T.LIQUID;
      const below = ty + 1 < m.h ? m.tiles[(ty + 1) * m.w + tx] : T.SOLID;
      const fall = !(L && R) && (below === T.LIQUID || below === T.EMPTY) && (!surface || m.tiles[(ty - 1) * m.w + tx] === T.SOLID);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (fall || (!surface && !(L && R))) {
        ctx.strokeStyle = col[1]; ctx.lineWidth = 2;
        for (let k = 0; k < 5; k++) {
          const sx = x + 5 + k * 9 + Math.sin(tx * 3 + k) * 2;
          const off = ((t * 420 + k * 37 + tx * 53) % 64) - 16;
          ctx.globalAlpha = 0.18 + (k % 2) * 0.12;
          ctx.beginPath(); ctx.moveTo(sx, y + off); ctx.lineTo(sx, y + off + 22); ctx.stroke();
        }
      } else if (!surface) {
        // 넓은 수면 아래: 은은한 반짝임
        const a = 0.06 + 0.05 * Math.sin(t * 2 + tx * 1.7 + ty * 2.3);
        ctx.globalAlpha = a; ctx.fillStyle = col[1];
        ctx.fillRect(x + ((t * 20 + tx * 13) % 40), y + 10 + (ty % 3) * 10, 8, 2);
      }
      if (surface && below !== T.LIQUID && kind !== 'lava') { /* 얕은 물 */ }
      if (kind === 'lava' && surface && Math.random() < 0.02) { /* 거품은 파티클이 담당 */ }
      ctx.restore();
    }
  }
  /** 배경 장식 문자 ('W' 창문, '|' 기둥) + 테마 소품 */
  drawDecor(ctx, cam, t) {
    for (const p of this.props) {
      if (p.x + p.d.w < cam.x - 50 || p.x > cam.x + cam.vw + 50 || p.y + p.d.h < cam.y - 50 || p.y > cam.y + cam.vh + 50) continue;
      const c = this.darkProp(p.d.id, p.d.w, p.d.h, p.d.dim);
      if (c) ctx.drawImage(c, p.x, p.y);
    }
    const openSky = OPEN_SKY_THEMES.has(this.stage.theme);
    for (const d of this.map.decor) {
      const x = d.tx * TILE, y = d.ty * TILE;
      if (x < cam.x - 200 || x > cam.x + cam.vw + 200) continue;
      if (d.ch === 'W') {
        if (openSky) continue;
        // 달빛 고딕 창문
        ctx.save();
        ctx.fillStyle = '#0a0610';
        ctx.beginPath(); ctx.moveTo(x - 8, y + 96); ctx.lineTo(x - 8, y + 20); ctx.arc(x + 24, y + 20, 32, Math.PI, 0); ctx.lineTo(x + 56, y + 96); ctx.fill();
        const g = ctx.createLinearGradient(x, y - 10, x, y + 90);
        g.addColorStop(0, 'rgba(160,180,255,0.5)'); g.addColorStop(1, 'rgba(60,40,120,0.25)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(x, y + 90); ctx.lineTo(x, y + 20); ctx.arc(x + 24, y + 20, 24, Math.PI, 0); ctx.lineTo(x + 48, y + 90); ctx.fill();
        ctx.strokeStyle = '#140c18'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 24, y - 4); ctx.lineTo(x + 24, y + 90); ctx.moveTo(x, y + 40); ctx.lineTo(x + 48, y + 40); ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        const lg = ctx.createLinearGradient(x, y, x + 120, y + 260);
        lg.addColorStop(0, 'rgba(140,160,255,0.12)'); lg.addColorStop(1, 'rgba(140,160,255,0)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(x, y + 20); ctx.lineTo(x + 48, y + 20); ctx.lineTo(x + 180, y + 280); ctx.lineTo(x + 80, y + 280); ctx.fill();
        ctx.restore();
      } else if (d.ch === '|') {
        if (y + TILE < cam.y || y > cam.y + cam.vh) continue;
        // 기둥 줄기의 위/아래 끝이면 주두/주초
        const spr = this.pillarSprite(), S = TILE;
        const top = !this.isBar(d.tx, d.ty - 1), bot = !this.isBar(d.tx, d.ty + 1);
        ctx.drawImage(spr, 0, top ? S : 0, S, S, x, y, S, S);
        if (bot) ctx.drawImage(spr, 0, S * 3 - 16, S, 16, x, y + S - 16, S, 16);
      }
    }
  }
  isBar(tx, ty) {
    if (!this.barSet) this.barSet = new Set(this.map.decor.filter((d) => d.ch === '|').map((d) => d.ty * this.map.w + d.tx));
    return tx >= 0 && tx < this.map.w && this.barSet.has(ty * this.map.w + tx);
  }
  /**
   * '|' 장식 기둥 스프라이트 (캐시): 타일 스타일 색으로 원통 음영을 준 세로 홈 기둥.
   * 세로 3칸 = [0] 몸통, [1] 주두(윗끝), [2] 주초(아랫끝). 배경 요소라 전체를 한 톤 눌러 둔다.
   */
  pillarSprite() {
    if (this.pillarCanvas) return this.pillarCanvas;
    const st = this.style, S = TILE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S * 3;
    const g = c.getContext('2d');
    const dark = st.edge, body = mix(st.base, st.top, 0.3), lit = mix(st.base, st.top, 0.75);
    const hgrad = (x0, x1) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, dark); gr.addColorStop(0.28, lit); gr.addColorStop(0.6, body); gr.addColorStop(1, dark);
      return gr;
    };
    const shaft = (y0, h) => {
      g.fillStyle = hgrad(9, 39); g.fillRect(9, y0, 30, h);
      // 세로 홈 (어두운 홈 + 옆의 가는 반사광)
      for (const fx of [15, 21, 27, 33]) {
        g.fillStyle = rgba(st.edge, 0.5); g.fillRect(fx, y0, 2, h);
        g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(fx + 2, y0, 1, h);
      }
    };
    // [0] 몸통
    shaft(0, S);
    // [1] 주두: 몸통 위에 넓은 판(아바쿠스) + 둥근 받침(에키누스) + 그 아래 그림자
    shaft(S, S);
    g.fillStyle = hgrad(4, 44);
    g.beginPath(); g.moveTo(5, S + 9); g.lineTo(43, S + 9); g.lineTo(38, S + 17); g.lineTo(10, S + 17); g.fill();
    g.fillStyle = hgrad(1, 47); g.fillRect(1, S, 46, 9);
    g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(1, S + 8, 46, 1);
    g.fillStyle = rgba(st.edge, 0.9); g.fillRect(1, S, 46, 2); g.fillRect(10, S + 17, 28, 1);
    const sh = g.createLinearGradient(0, S + 17, 0, S + 30);
    sh.addColorStop(0, 'rgba(0,0,0,0.4)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(9, S + 17, 30, 13);
    // [2] 주초: 둥근 테(토루스) + 넓은 받침돌(플린스) — 아래 16px 만 잘라 몸통 끝에 덧그린다
    shaft(S * 2, S);
    const by = S * 3 - 16;
    g.fillStyle = hgrad(6, 42); g.fillRect(6, by, 36, 6);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(6, by, 36, 1);
    g.fillStyle = hgrad(2, 46); g.fillRect(2, by + 6, 44, 10);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(2, by + 6, 44, 1);
    g.fillStyle = rgba(st.edge, 0.9); g.fillRect(2, S * 3 - 2, 44, 2);
    // 배경 톤으로 눌러 게임 레이어(벽/발판)와 구분
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(st.edge, 0.25); g.fillRect(0, 0, S, S * 3);
    this.pillarCanvas = c;
    return c;
  }
}
