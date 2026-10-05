// 고스트: 연습·일일 도전 중 영웅 상태를 10Hz 로 기록하고(방·x·y·방향·자세) 작은 이진 → base64 로 묶는다. 다시 그릴 때는
// 같은 경과 시간(world.run.time)의 위치에 반투명 실루엣을 그린다 (충돌·소리 없음). 형식: docs/specs/online.md 부록 A
//  - GhostRecorder(world): sample() 를 매 틱 (run.time 이 표본 간격을 넘을 때마다 한 칸) · encode() → base64 (≤ 24KB 가 될 때까지
//    10Hz → 5Hz → 2.5Hz 로 줄인다)
//  - decodeGhost(b64) → { hz, unit, rooms[], n, room:Uint8Array, x:Int32Array, y:Int32Array, fp:Uint8Array, ps:Uint32Array } | null
//  - GhostPlayer(track, puppet): at(t) → {room, x, y, facing, pose, poseT} · draw(ctx, world) (카메라 안에서) · marker(ctx, world, vw, vh)
//    (다른 방에 있으면 화면 가장자리에 '고스트: 앞/뒤 N초')
// 그리기 비용: 영웅 그림 한 번(단색 합성 경로, render/hero.js drawComposite) + 글자 한 줄. 같은 방이 아니면 그리지 않는다
import { drawHero } from '../render/hero.js';
import { text, FONT } from '../core/ui.js';
import { clamp } from '../core/math.js';

export const GHOST_LIMIT = 24 * 1024;   // base64 글자 수 상한 (docs/specs/online.md §2.2)
const MAGIC0 = 0x42, MAGIC1 = 0x47, VERSION = 1;   // 'BG'
const UNIT = 4;                                     // 위치 양자화 (px)
/** 자세 표 (4비트 — 순서를 바꾸지 않는다: 이미 올린 고스트가 읽혀야 한다) */
export const POSES = ['idle', 'run', 'jump', 'fall', 'dash', 'crouch', 'hurt', 'wall', 'throw', 'cast', 'charge', 'attack', 'flip', 'land', 'death', 'ride'];
const POSE_OF = Object.fromEntries(POSES.map((p, i) => [p, i]));
const ALIAS = { walk: 'run', run_start: 'run', sprint: 'run', skid: 'land', pivot: 'idle', land_heavy: 'land', ride_duck: 'ride', ride_charge: 'ride', ride_rear: 'ride', ride_hurt: 'ride' };
/** 플레이어 → 자세 번호 */
export function poseOf(p) {
  if (p?.dead) return POSE_OF.death;
  if (p?.move) return POSE_OF.attack;
  const a = p?.anim ?? 'idle';
  return POSE_OF[a] ?? POSE_OF[ALIAS[a]] ?? (String(a).startsWith('ride') ? POSE_OF.ride : 0);
}

// ───────────────────────── 기록 ─────────────────────────
export class GhostRecorder {
  constructor(hz = 10) {
    this.hz = hz; this.next = 0;
    this.rooms = []; this.roomIx = new Map();
    // 프레임: 방(1) · qx(2) · qy(2) · 방향|자세(1) — 20분 = 12000칸, 2시간까지 늘어난다
    this.cap = 4096; this.n = 0;
    this.r = new Uint8Array(this.cap); this.x = new Int32Array(this.cap); this.y = new Int32Array(this.cap); this.fp = new Uint8Array(this.cap);
  }
  grow() {
    const c = this.cap * 2;
    const g = (A, a) => { const b = new A(c); b.set(a); return b; };
    this.r = g(Uint8Array, this.r); this.x = g(Int32Array, this.x); this.y = g(Int32Array, this.y); this.fp = g(Uint8Array, this.fp);
    this.cap = c;
  }
  /** 매 틱: t = world.run.time (초), p = 플레이어, roomId = world.roomId */
  sample(t, p, roomId) {
    if (!p || !(t >= 0)) return;
    if (this.n >= 72000) return;   // 2시간 (§3 상한)
    while (t + 1e-9 >= this.next) {
      if (this.n >= this.cap) this.grow();
      let ri = this.roomIx.get(roomId);
      if (ri === undefined) { if (this.rooms.length >= 255) ri = 0; else { ri = this.rooms.length; this.rooms.push(String(roomId).slice(0, 32)); this.roomIx.set(roomId, ri); } }
      const i = this.n++;
      this.r[i] = ri;
      this.x[i] = Math.round((p.cx ?? 0) / UNIT); this.y[i] = Math.round((p.bottom ?? 0) / UNIT);
      this.fp[i] = ((p.facing ?? 1) < 0 ? 16 : 0) | (poseOf(p) & 15);
      this.next += 1 / this.hz;
    }
  }
  /** 기록 → base64 (상한을 넘으면 간격을 늘려 다시). 비었으면 null */
  encode(limit = GHOST_LIMIT) {
    if (!this.n) return null;
    for (const step of [1, 2, 4, 8]) {
      const b64 = toB64(encodeFrames(this, step));
      if (b64.length <= limit) return b64;
    }
    return null;
  }
}

/** 프레임 묶기 (step 칸마다 하나 → hz/step). 연산 목록은 docs/specs/online.md 부록 A */
export function encodeFrames(rec, step = 1) {
  const out = [];
  const u8 = (v) => out.push(v & 255);
  const u16 = (v) => { u8(v); u8(v >> 8); };
  const u32 = (v) => { u16(v & 0xffff); u16(v >>> 16); };
  const hz = rec.hz / step;
  const n = Math.ceil(rec.n / step);
  u8(MAGIC0); u8(MAGIC1); u8(VERSION);
  u8(Math.round(1000 / hz / 10));   // 표본 간격 (1/100초)
  u8(UNIT);
  u32(n);
  u8(rec.rooms.length);
  for (const id of rec.rooms) { const s = [...id].map((c) => c.charCodeAt(0) & 127); u8(s.length); s.forEach(u8); }
  let pr = -1, px = 0, py = 0, dx = 0, dy = 0, st = -1, rep = 0;
  const flush = () => { while (rep > 0) { const k = Math.min(64, rep); u8(k - 1); rep -= k; } };
  for (let j = 0; j < n; j++) {
    const i = Math.min(rec.n - 1, j * step);
    const r = rec.r[i], x = rec.x[i], y = rec.y[i], fp = rec.fp[i] & 31;
    if (fp !== st) { flush(); u8(0xc0 | fp); st = fp; }
    const ex = x - px, ey = y - py;
    if (r !== pr || ex < -32 || ex > 31 || ey < -128 || ey > 127) {
      flush();
      u8(0xe0); u8(r); u16(x & 0xffff); u16(y & 0xffff);
      dx = 0; dy = 0;
    } else if (ex === dx && ey === dy) {
      rep++;
    } else {
      flush();
      if (ey === 0) u8(0x40 | (ex & 63));
      else { u8(0x80 | (ex & 63)); u8(ey & 255); }
      dx = ex; dy = ey;
    }
    pr = r; px = x; py = y;
  }
  flush();
  return Uint8Array.from(out);
}
const s6 = (v) => ((v & 63) ^ 32) - 32;
const s8 = (v) => ((v & 255) ^ 128) - 128;
const s16 = (v) => ((v & 0xffff) ^ 0x8000) - 0x8000;

/** base64 → 고스트 궤적 (모양이 틀리면 null) */
export function decodeGhost(b64) {
  let b;
  try { b = fromB64(b64); } catch { return null; }
  if (!b || b.length < 10 || b[0] !== MAGIC0 || b[1] !== MAGIC1 || b[2] !== VERSION) return null;
  let o = 3;
  const cs = b[o++], unit = b[o++] || UNIT;
  const n = b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24); o += 4;
  if (!(cs > 0) || !(n > 0) || n > 100000) return null;
  const rc = b[o++], rooms = [];
  for (let k = 0; k < rc; k++) { const L = b[o++]; let s = ''; for (let q = 0; q < L; q++) s += String.fromCharCode(b[o++]); rooms.push(s); }
  const T = { hz: 100 / cs, unit, rooms, n, room: new Uint8Array(n), x: new Int32Array(n), y: new Int32Array(n), fp: new Uint8Array(n), ps: new Uint32Array(n) };
  let f = 0, r = 0, x = 0, y = 0, dx = 0, dy = 0, st = 0, ps = 0;
  const put = () => {
    if (f >= n) return;
    if (f > 0 && T.fp[f - 1] !== st) ps = f;
    T.room[f] = r; T.x[f] = x * unit; T.y[f] = y * unit; T.fp[f] = st; T.ps[f] = ps; f++;
  };
  while (o < b.length && f < n) {
    const op = b[o++];
    if (op < 0x40) { for (let k = 0; k <= op; k++) { x += dx; y += dy; put(); } }
    else if (op < 0x80) { dx = s6(op); dy = 0; x += dx; put(); }
    else if (op < 0xc0) { dx = s6(op); dy = s8(b[o++]); x += dx; y += dy; put(); }
    else if (op < 0xe0) { st = op & 31; }
    else if (op === 0xe0) { r = b[o++]; x = s16(b[o] | (b[o + 1] << 8)); y = s16(b[o + 2] | (b[o + 3] << 8)); o += 4; dx = 0; dy = 0; put(); }
    else break;
  }
  if (f < n) { T.n = f; if (!f) return null; }
  return T;
}

function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  if (typeof b64 !== 'string' || b64.length > GHOST_LIMIT * 2) return null;
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

// ───────────────────────── 다시 그리기 ─────────────────────────
const GHOST_TINT = '#9fd8ff';
const ANIM_OF = { attack: 'throw', death: 'hurt' };
export class GhostPlayer {
  /** track: decodeGhost 결과 · pup: drawHero 용 가짜 엔티티 (front/common.js puppet) · label: '1위 닉' 등 */
  constructor(track, pup, label = '') {
    this.T = track; this.pup = pup; this.label = label;
    this.cur = { room: null, x: 0, y: 0, facing: 1, pose: 'idle', poseT: 0, i: 0, done: false };
    this._mk = { at: -1, room: null, txt: null, side: 0 };
    // 방 구간 [{room, i0, i1}] — 다른 방에 있을 때 앞/뒤 시간 계산
    const seg = [];
    for (let i = 0; i < track.n; i++) {
      const r = track.rooms[track.room[i]] ?? '';
      if (!seg.length || seg[seg.length - 1].room !== r) seg.push({ room: r, i0: i, i1: i }); else seg[seg.length - 1].i1 = i;
    }
    this.seg = seg;
  }
  get duration() { return this.T.n / this.T.hz; }
  /** t 초의 상태 (같은 방이면 다음 칸과 보간) */
  at(t) {
    const T = this.T, c = this.cur;
    const f = Math.max(0, t) * T.hz;
    const i = Math.min(T.n - 1, Math.floor(f));
    const k = Math.min(1, f - i);
    const j = Math.min(T.n - 1, i + 1);
    c.i = i; c.done = f >= T.n - 1;
    c.room = T.rooms[T.room[i]] ?? null;
    const same = T.room[j] === T.room[i] && !c.done;
    c.x = same ? T.x[i] + (T.x[j] - T.x[i]) * k : T.x[i];
    c.y = same ? T.y[i] + (T.y[j] - T.y[i]) * k : T.y[i];
    const fp = T.fp[i];
    c.facing = fp & 16 ? -1 : 1;
    c.pose = POSES[fp & 15] ?? 'idle';
    c.poseT = Math.max(0, t - T.ps[i] / T.hz);
    return c;
  }
  /** 카메라 변환 안에서 (같은 방일 때만) */
  draw(ctx, world, t) {
    const c = this.at(t);
    if (c.done || c.room !== world.roomId) return false;
    const p = this.pup;
    if (!p) return false;
    p.cx = c.x; p.bottom = c.y; p.x = c.x - (p.w ?? 30) / 2; p.y = c.y - (p.h ?? 60);
    p.facing = c.facing; p.anim = ANIM_OF[c.pose] ?? c.pose; p.animT = c.pose === 'attack' ? c.poseT % 0.3 : c.poseT;
    p.vx = 0; p.vy = c.pose === 'jump' ? -300 : c.pose === 'fall' ? 300 : 0; p.onGround = c.pose !== 'jump' && c.pose !== 'fall';
    p.t = world.time; p.move = null;
    try { drawHero(ctx, p, world, { alpha: 0.42, tint: GHOST_TINT, noFx: true }); } catch { return false; }
    if (this.label) text(ctx, this.label, c.x, c.y - (p.h ?? 60) - 18, { size: 12, align: 'center', weight: 800, color: GHOST_TINT, ow: 2 });
    return true;
  }
  /** 다른 방에 있으면 앞/뒤 몇 초인지 (0.25초마다 다시 계산). → {side: 1 앞 | -1 뒤, sec} | null */
  offset(world, t) {
    const room = world.roomId, mk = this._mk;
    if (mk.room === room && Math.abs(t - mk.at) < 0.25) return mk.res;
    mk.room = room; mk.at = t;
    const c = this.at(t);
    if (c.room === room && !c.done) { mk.res = null; return null; }
    const hz = this.T.hz, i = c.i;
    let ahead = null, behind = null;
    for (const s of this.seg) {
      if (s.room !== room) continue;
      if (s.i1 < i) ahead = (i - s.i1) / hz;                                    // 이 방을 이미 지나갔다
      else if (s.i0 > i && behind === null) behind = (s.i0 - i) / hz;            // 아직 오지 않았다
    }
    if (c.done && ahead === null) ahead = Math.max(0, t - this.duration);       // 고스트는 이미 끝났다
    let res = null;
    if (ahead !== null && (behind === null || ahead <= behind)) res = { side: 1, sec: ahead };
    else if (behind !== null) res = { side: -1, sec: behind };
    mk.res = res;
    return res;
  }
  /** 화면 가장자리 표시 (화면 좌표) */
  marker(ctx, world, t, vw, vh, top = 0) {
    const o = this.offset(world, t);
    if (!o) return;
    const s = Math.max(1, Math.round(o.sec));
    const str = o.side > 0 ? `고스트: 앞 ${s}초 ▶` : `◀ 고스트: 뒤 ${s}초`;
    const y = clamp(vh * 0.36, top + 40, vh - 40);
    const w = 150, x = o.side > 0 ? vw - w - 8 : 8;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(6,14,24,0.72)'; ctx.fillRect(x, y - 15, w, 26);
    ctx.fillStyle = GHOST_TINT; ctx.fillRect(o.side > 0 ? x + w - 3 : x, y - 15, 3, 26);
    text(ctx, str, x + w / 2, y + 4, { size: 13, align: 'center', weight: 800, family: FONT.body, color: GHOST_TINT, ow: 2 });
    ctx.restore();
  }
}
