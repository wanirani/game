// 리빌드 시범 C (장면 v2c) — 시범판 B 의 놀이·카메라·영웅·적은 그대로 두고 **세계만 환경 키트로 다시 지은** 장면. docs/v2/ENV_KIT.md
//   mats.js   재질 표 · 아틀라스 조각        geo.js    기하 쓰기 + 빛 굽기 (B 의 정점 형식)
//   kit.js    건물 조각 (벽·창·문·지붕·계단…)  props.js  저폴리 3D 소품
//   build.js  스테이지 컴파일러 (충돌은 B 의 compileStage)   stage_slice0_env.js  저작 데이터
// B 를 고치지 않고 상속한다: _load 에서 세계를 바꿔 끼우고, 받은 뒤에 키트 텍스처·메시를 더 올린다.
//   그리기는 B 의 render 가 한다 — 우리는 프레임마다 this.meshes(그릴 정적 메시 목록)를 "보이는 덩어리"로 채우고,
//   바닥 스티커 단계(_decals)에 얼룩·빛 웅덩이·소품 그림자·등불 번짐을 끼워 넣는다. 프레임마다 올리는 캔버스는 없다.
// 주소 옵션: ?envq=0 → 반투명 꾸밈(얼룩·빛 웅덩이·번짐 바깥 겹)을 끈다 (느린 기기용 한 단계)
import V2ProtoB from '../b/index.js';
import { Sim } from '../b/sim.js';
import { lightAt } from '../b/world.js';
import { ASSET_ROOT } from '../../core/assets.js';
import STAGE from './stage_slice0_env.js';
import { compileEnv, uniformBoxes } from './build.js';
import { KIT_TEX } from './mats.js';
import { drawDecalSprites, DECAL_ALPHA } from './decals.js';
import { AREAS, PROTO_KIND, ensureWorldAssets } from '../world/index.js';

/** 지역(AREA_FORMAT) → 시범판 규칙으로 걸을 수 있는 스테이지: 시작 = 고른 들머리, 적 = 근접/원거리 두 종류로 */
function protoStage(a, spawnName, peace) {
  const sp = a.spawns[spawnName] ?? a.spawns.default;
  return { ...a.stage, start: { x: sp.x, z: sp.z }, spawns: peace ? [] : a.stage.spawns.map((s) => ({ ...s, kind: PROTO_KIND[s.kind] ?? 'melee', yard: false })) };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export default class V2Env extends V2ProtoB {
  enter(params) {
    let q = null; try { q = new URLSearchParams(globalThis.location?.search ?? '').get('envq'); } catch { q = null; }
    // 주소 옵션: ?area=<id> (src/v2/world 의 지역을 시범판 규칙으로 걷는다) · &spawn=<들머리> · &peace=1 (적 없음) · &areanav=0 (나가는 곳에 닿아도 넘어가지 않는다)
    let Q = null; try { Q = new URLSearchParams(globalThis.location?.search ?? ''); } catch { Q = null; }
    this.areaId = params?.area ?? Q?.get('area') ?? null; this.spawnName = params?.spawn ?? Q?.get('spawn') ?? 'default'; this.peace = Q?.get('peace') === '1'; this.areaNav = Q?.get('areanav') !== '0';
    this.areaFlags = Object.fromEntries(String(params?.flags ?? Q?.get('flags') ?? '').split(',').filter(Boolean).map((f) => [f, true]));   // &flags=bell_hung,gate_open: the area's story state (docs/v2/AREA_FORMAT.md 13)
    this.area = null; this.areaState = { in: {}, hits: [], fired: [], near: null, msg: '', msgT: 0, going: false };
    this.envQ = q === '0' ? 0 : 1; this.envMeshes = null; this.envStat = { chunks: 0, tris: 0, texBytes: 0, loadMs: 0, compileMs: 0 };
    super.enter(params);
    if (globalThis.__v2) { globalThis.__v2.id = 'c'; globalThis.__v2.base = 'b'; Object.defineProperty(globalThis.__v2, 'areaInfo', { configurable: true, get: () => ({ id: this.area?.id ?? null, want: this.areaId, spawn: this.spawnName, hits: this.areaState.hits, fired: this.areaState.fired, near: this.areaState.near }) }); }
  }
  update(dt) {
    super.update(dt);
    if (this.area && this.ready && this.sim) this._areaTick(dt);
  }
  /** 지역의 나가는 곳 · 사건 상자 · 쓸 수 있는 것: 영웅 발이 닿았는지 본다 (시범 장면이라 잠긴 곳도 그냥 알려만 준다) */
  _areaTick(dt) {
    const h = this.sim.hero, a = this.area, st = this.areaState;
    if (st.msgT > 0) st.msgT -= dt;
    for (const x of a.exits) {
      const inside = h.x >= x.x0 && h.x <= x.x1 && h.z >= x.z0 && h.z <= x.z1;
      if (inside && !st.in[x.id]) {
        st.hits.push(x.id); st.msg = '→ ' + (x.label ?? x.to) + (x.locked ? ' (잠김)' : AREAS[x.to] ? '' : ' (아직 없음)'); st.msgT = 3;
        if (this.areaNav && AREAS[x.to] && !st.going) { st.going = true; try { const u = new URL(globalThis.location.href); u.searchParams.set('scene', 'v2c'); u.searchParams.set('area', x.to); u.searchParams.set('spawn', x.spawn); setTimeout(() => { globalThis.location.href = u.toString(); }, 500); } catch { st.going = false; } }
      }
      st.in[x.id] = inside;
    }
    for (const t of a.triggers) if (!st.fired.includes(t.id) && h.x >= t.x0 && h.x <= t.x1 && h.z >= t.z0 && h.z <= t.z1) { st.fired.push(t.id); st.msg = '사건: ' + t.event; st.msgT = 2; }
    let near = null, bd = 1e9; for (const it of a.interact) { const d = Math.hypot(it.x - h.x, it.z - h.z); if (d < it.r && d < bd) { bd = d; near = it; } }
    st.near = near ? near.id : null; st.nearLabel = near ? near.label : '';
  }
  exit() {
    super.exit(); this.envMeshes = null;
    if (globalThis.__v2?.id === 'c' && globalThis.__v2.scene === this) delete globalThis.__v2;
  }
  async _load() {
    const t0 = performance.now();
    await ensureWorldAssets();                     // 구운 소품 묶음 (석상·가고일·고목) — 못 받으면 저폴리 소품이 대신 선다
    let stage = STAGE;
    if (this.areaId && AREAS[this.areaId]) { try { this.area = await AREAS[this.areaId](this.areaFlags); stage = protoStage(this.area, this.spawnName, this.peace); } catch (e) { console.warn('[v2c] area failed, using the test route:', e); this.area = null; } }
    if (!this.glr && !this.glError) return;
    this.W = compileEnv(stage);                    // B 가 텍스처·소품을 받기 전에 세계를 바꿔 끼운다
    if (this.area) {   // 시범판 규칙은 "마당 적이 없으면 끝"이다 → 닿을 수 없는 먼 곳에 마당 적 하나를 세워 끝나지 않게 한다
      this.W.boxes.push({ x0: -9100, x1: -9000, z0: -9100, z1: -9000, y0: -10, y1: 0, solid: true, walk: true, inv: true });
      this.W.spawns.push({ kind: 'melee', x: -9050, z: -9050, y: 0, yard: true });
      uniformBoxes(this.W);   // the box pushed by hand gets the shape of the others (one hidden class for groundAt / moveXZ)
    }
    this.sim = new Sim(this.W, this._hooks());
    if (this.area) { const sp = this.area.spawns[this.spawnName] ?? this.area.spawns.default, h = this.sim.hero; h.facing = sp.face[0] < 0 ? -1 : 1; h.dirX = sp.face[0]; h.dirZ = sp.face[1]; }
    this.envStat.compileMs = performance.now() - t0;
    await super._load();
    if (!this.glr || !this.ready) return;
    this.ready = false;
    await this._loadEnv();
    if (!this.glr) return;
    this.envStat.loadMs = performance.now() - t0;
    this.ready = true;
  }
  async _loadEnv() {
    const glr = this.glr, W = this.W, E = W.env;
    // 1) 키트 텍스처
    const names = E.stats.textures.filter((n) => !this.tex[n]), imgs = {};   // 이 지역이 쓰는 것만 받는다
    await Promise.all(names.map((n) => new Promise((res) => { const im = new Image(); im.onload = () => { imgs[n] = im; res(); }; im.onerror = () => { imgs[n] = null; console.warn('[v2c] kit texture failed to load:', n); res(); }; im.src = `${ASSET_ROOT}v2/env/${n}.webp`; })));
    if (!this.glr) return;
    const b0 = glr.stats.texBytes;
    for (const n of names) {
      const im = imgs[n], c = document.createElement('canvas'); c.width = im?.width ?? 64; c.height = im?.height ?? 64; this._canvases.push(c);
      const x = c.getContext('2d'); if (im) x.drawImage(im, 0, 0); else { x.fillStyle = '#77747c'; x.fillRect(0, 0, 64, 64); }
      this.tex[n] = glr.texture(() => c, { repeat: KIT_TEX[n]?.repeat ?? true, mip: true });
    }
    // 2) 얼룩 스티커 → B 의 소품 아틀라스 빈자리 (한 번만 올린다)
    this.envSpr = null;
    try {
      const c = this.propTex.src(), used = Math.max(...Object.values(this.spr).map((r) => r.v1)) * c.height, oy = Math.ceil(used) + 8;
      if (oy + 266 <= c.height) {
        const r = drawDecalSprites(c.getContext('2d'), 4, oy), uv = ([px, py]) => ({ u0: (px + 1) / c.width, v0: (py + 1) / c.height, u1: (px + 127) / c.width, v1: (py + 127) / c.height });
        this.envSpr = {}; for (const k in r) this.envSpr[k] = uv(r[k]);
        glr.update(this.propTex, c, c.height);
      }
    } catch (e) { console.warn('[v2c] decal sprites skipped', e); }
    // 3) 정적 메시 (덩어리 × 텍스처)
    this.envMeshes = E.meshes.map((m) => ({ chunk: m.chunk, mesh: glr.mesh(m.data, m.count), tex: this.tex[m.tex], tris: m.count / 3 })).filter((m) => m.tex);
    this.envChunks = [...E.bounds.entries()].map(([id, b]) => ({ id, b, on: true }));
    this.envStat.texBytes = glr.stats.texBytes - b0;
    // 4) 스티커의 색 (그 자리의 구운 빛)
    const lit = (x, y, z) => { const l = lightAt(W, x, y + 4, z, 0, 1, 0); return [clamp(l[0], 0, 1.8), clamp(l[1], 0, 1.8), clamp(l[2], 0, 1.8)]; };
    for (const d of E.decals) d._c = lit(d.x, d.y ?? 0, d.z);
  }
  /** 보이는 덩어리만 그릴 목록에 넣는다 (경계 상자 ↔ 시야 절두체) */
  _cull() {
    const m = this._matrix(this.game.viewW, this.game.viewH), far = (this.W.fog.far ?? 3300) * 1.15;
    let tris = 0, on = 0;
    for (const c of this.envChunks) {
      const b = c.b; let l = 0, r = 0, t = 0, bt = 0, bh = 0, fa = 0;
      for (let i = 0; i < 8; i++) {
        const x = b[i & 1 ? 3 : 0], y = b[i & 2 ? 4 : 1], z = b[i & 4 ? 5 : 2];
        const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (cx < -cw) l++; if (cx > cw) r++; if (cy < -cw) bt++; if (cy > cw) t++; if (cw < 1) bh++; if (cw > far) fa++;
      }
      c.on = !(l === 8 || r === 8 || t === 8 || bt === 8 || bh === 8 || fa === 8); if (c.on) on++;
    }
    const L = this.meshes; L.length = 0;
    for (const e of this.envMeshes) { const c = this.envChunks.find((q) => q.id === e.chunk); if (!c || c.on) { L.push(e); tris += e.tris; } }
    this.envStat.chunks = on; this.envStat.tris = tris; this.envStat.draws = L.length;
  }
  render(ctx) {
    if (this.ready && this.envMeshes && this.glr && !this.glr.lost) this._cull();
    super.render(ctx);
    if (this.ready && this.glr && !this.glr.lost && !this.layer.on) this._tag(ctx);
    else if (this.layer.on && this.layer.hctx && this.ready) this._tag(this.layer.hctx);
  }
  _tag(ctx) {   // 어느 장면인지 작은 표시 (정보 줄 위)
    const g = this.game, s = g.safe ?? { l: 0, r: 0, t: 0, b: 0 }, e = this.envStat;
    if (!this.area && (this.sim.time < 7.5 || this.sim.done)) return;   // 처음 조작 안내·끝 표시와 겹치지 않게
    ctx.save(); ctx.font = '500 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,210,200,0.6)';
    ctx.fillText(`C · ${this.area ? this.area.id : 'env kit'} · ${e.chunks} chunks · ${Math.round(e.tris)} static tri · q${this.envQ}`, g.viewW / 2, g.viewH - 22 - s.b);
    if (this.area) {   // 지역 걷기: 나가는 곳 · 사건 · 쓸 수 있는 것 알림
      const st = this.areaState; ctx.font = '600 15px sans-serif'; ctx.fillStyle = 'rgba(240,220,170,0.92)';
      if (st.msgT > 0) ctx.fillText(st.msg, g.viewW / 2, g.viewH * 0.3);
      if (st.near) ctx.fillText('[ ' + st.nearLabel + ' ]', g.viewW / 2, g.viewH * 0.36);
    }
    ctx.restore();
  }
  /** 바닥 스티커: 얼룩·물웅덩이 → 빛 웅덩이 → 소품 그림자 → (B 의 그림자·예고) → 등불 번짐. 프레임마다 새로 만드는 배열 없음 */
  _decals(b) {
    const E = this.W.env, S = this.spr, K = this.envSpr, c = this.cam, t = this.sim.time, P = this._q ?? (this._q = new Array(12));
    const near = (x, z, m) => Math.abs(x - c.tx) < m && z - c.tz > -700 && z - c.tz < 2600;
    const flat = (x, y, z, rx, rz) => { P[0] = x - rx; P[1] = y; P[2] = z - rz; P[3] = x + rx; P[4] = y; P[5] = z - rz; P[6] = x + rx; P[7] = y; P[8] = z + rz; P[9] = x - rx; P[10] = y; P[11] = z + rz; return P; };
    if (this.envQ && K) for (const d of E.decals) {
      if (!near(d.x, d.z, 1500)) continue;
      const uv = K[d.k]; if (!uv) continue;
      const l = d._c, a = d.a ?? DECAL_ALPHA[d.k] ?? 0.7;
      b.quad(flat(d.x, (d.y ?? 0) + 0.6, d.z, d.rx, d.rz), uv.u0, uv.v0, uv.u1, uv.v1, l[0], l[1], l[2], a, 1, 0, 3, 1);
    }
    if (this.envQ) for (const p of E.fx.pools) {
      if (!near(p.x, p.z, 1500)) continue;
      const g = S.glow, f = p.flicker ? 0.86 + 0.14 * Math.sin(t * 11 + p.x) : 1, r = p.r * (p.flicker ? 0.96 + 0.05 * Math.sin(t * 7 + p.z) : 1);
      b.quad(flat(p.x, p.y + 0.8, p.z, r, r * 0.8), g.u0, g.v0, g.u1, g.v1, p.c[0], p.c[1], p.c[2], p.a * f, 0, 0, 4, 0.8);
    }
    const bl = S.blob;
    for (const s of E.fx.shadows) if (near(s.x, s.z, 1500)) b.quad(flat(s.x, s.y + 0.9, s.z, s.rx, s.rz), bl.u0, bl.v0, bl.u1, bl.v1, 0, 0, 0, s.a, 1, 0, 4, 1);
    super._decals(b);
    const R = this.camR, U = this.camU, g = S.glow;
    if (R && U) for (const s of E.fx.glows) {   // 등불 번짐: 카메라를 보는 더하기 빛 (안쪽 겹 + 넓은 겹; envq=0 이면 안쪽 겹만)
      if (!near(s.x, s.z, 1700)) continue;
      const k = s.flicker ? 0.9 + 0.12 * Math.sin(t * 13 + s.x) + 0.06 * Math.sin(t * 31 + s.z) : 1;
      for (let j = 0; j < (this.envQ ? 2 : 1); j++) {
        const rr = s.r * k * (j ? 2.6 : 1);
        for (let i = 0; i < 4; i++) { const su = i === 0 || i === 3 ? -rr : rr, sv = i < 2 ? -rr : rr; P[i * 3] = s.x + R[0] * su + U[0] * sv; P[i * 3 + 1] = s.y + R[1] * su + U[1] * sv; P[i * 3 + 2] = s.z + R[2] * su + U[2] * sv; }
        b.quad(P, g.u0, g.v0, g.u1, g.v1, s.c[0], s.c[1], s.c[2], j ? 0.2 : 0.8, 0, 0, 14, 0.6);
      }
    }
  }
  stats() {
    const s = super.stats(), E = this.W?.env, e = this.envStat;
    s.env = E ? { quality: this.envQ, staticTris: E.stats.tris, staticBytes: E.stats.bytes, perChunk: E.stats.chunks, textures: E.stats.textures.length, visibleChunks: e.chunks, visibleStaticTris: Math.round(e.tris), staticDraws: e.draws ?? 0, kitTexBytes: e.texBytes, compileMs: Math.round(e.compileMs), loadMs: Math.round(e.loadMs), decals: E.decals.length, glows: E.fx.glows.length, pools: E.fx.pools.length, shadows: E.fx.shadows.length, lights: this.W.lights.length, cards: this.W.sprites.length } : null;
    return s;
  }
}
