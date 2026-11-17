// 리빌드 시범판 A — Canvas 2D 만으로 그린 입체 세계 (docs/v2/SLICE0.md · docs/v2/proto_a.md)
// 장면 = 셸(core/game.js Scene) 위에 그대로 올라간다: 입력(core/input.js) · 가상 패드(showPad) · 소리 · 글꼴 · 해상도는 v1 것.
//   proj.js   카메라·투영          stage.js  세계 모델(판 목록)·저작 낱말·자동 검증·SLICE0 데이터
//   render.js 세계 그리기           actors.js 영웅·적·탄·전투       art.js    v1 퍼펫·채색 적 어댑터
// 열기: index.html?scene=v2a  (&proj=oblique = 평행 투영 비교, &debug = 숫자 표시)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import * as ui from '../../core/ui.js';
import { Cam } from './proj.js';
import { buildSlice0, SLICE0, PIT_Y, WALL } from './stage.js';
import { Renderer } from './render.js';
import { Play } from './actors.js';

const SEC_NAME = { street: '거리', corner: '모퉁이', alley: '골목', yard: '마당', done: '마당' };
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export default class V2ProtoA extends Scene {
  constructor(game) {
    super(game);
    this.showPad = true; this.padHideButtons = ['sub', 'skill1', 'skill2', 'ult', 'swap', 'mount', 'guard', 'lock'];
    this.hideToasts = true; this.keepAwake = true;
    this.stage = null; this.cam = null; this.R = null; this.play = null;
    this.paused = false; this.frame = []; this.fi = 0; this.updMs = 0; this.debug = false; this.btns = {};
    this.camW = 0; this.lead = 0; this.floorY = 0;
  }
  enter() {
    const q = new URLSearchParams(globalThis.location?.search || '');
    this.stage = buildSlice0();
    this.cam = new Cam(); this.cam.ortho = q.get('proj') === 'oblique';
    this.R = new Renderer(this.game, this.stage);
    this.play = new Play(this.game, this.stage);
    this.debug = q.has('debug');
    this.paused = false; this.frame = new Float32Array(240); this.fi = 0; this.fn = 0;
    this._cam(1, true);
    try { this.game.audio?.music?.('s01', { fade: 0.8 }); } catch { /* 소리 없음 */ }
    const self = this, P = this.play;
    window.__v2 = {
      id: 'a', scene: this,
      get hero() { const h = P.hero; return { x: h.x, y: h.y, z: h.z, hp: h.hp, state: h.state, facing: h.facing }; },
      get enemies() { return P.enemies.filter((e) => !e.dead).map((e) => ({ kind: e.kindId, x: e.x, y: e.y, z: e.z, hp: e.hp, group: e.group, state: e.state, awake: e.awake })); },
      get cam() { const c = self.cam; return { x: c.x, y: c.y, z: c.z, f: c.f, h: c.h, horizon: c.horizon, ortho: c.ortho }; },
      get section() { return P.done ? 'done' : P.section; },
      get stats() { return { frameMs: self.frameStats(), strips: self.R.stats.strips, faces: self.R.stats.faces, items: self.R.stats.items, kills: P.kills }; },
      teleport(id) { const ok = P.teleport(id); if (ok) self._cam(1, true); return ok; },
      restart() { P.restart(); self._cam(1, true); },
      validate() { return self.stage.validate(); },
    };
  }
  exit() {
    this.R?.dispose(); this.R = null; this.play = null; this.stage = null;
    if (window.__v2?.scene === this) delete window.__v2;
  }
  frameStats() {
    const n = Math.min(this.fn, this.frame.length);
    if (!n) return { p50: 0, p95: 0, n: 0 };
    const a = Array.from(this.frame.subarray(0, n)).sort((x, y) => x - y);
    return { p50: +a[Math.floor(n * 0.5)].toFixed(2), p95: +a[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(2), n };
  }

  // ───────────────────────── 카메라 ─────────────────────────
  // 횡 구간: x 를 따라가고 z 는 절반만. 종 구간: 통로 가운데에 서서 z 를 따라 들어간다(초점 거리도 짧아져 원근이 세진다).
  // 모퉁이: 영웅이 골목 입구로 들어선 깊이에 따라 두 구도를 섞는다 — 카메라는 돌지 않고 앞으로 미끄러져 들어간다.
  _cam(dt, snap) {
    const cam = this.cam, h = this.play.hero, st = this.stage, S = SLICE0, H = this.game.viewH || 540;
    const ac = (S.alleyX0 + S.alleyX1) / 2;
    const inX = h.x > S.alleyX0 - 30 && h.x < S.alleyX1 + 30;
    const wT = inX ? smooth((h.z - 215) / 230) : (h.z > S.alleyZ0 ? 1 : 0);
    this.camW = snap ? wT : this.camW + (wT - this.camW) * Math.min(1, dt * 4);
    const w = this.camW, yard = smooth((h.z - (S.alleyZ1 - 120)) / 260);
    this.lead += (h.facing * 46 - this.lead) * Math.min(1, dt * 2.2);
    const sx = clamp(h.x + this.lead, 400, ac), sz = 52 + (h.z - 130) * 0.46;
    const ax = ac + (h.x - ac) * lerp(0.5, 0.36, yard), az = h.z - lerp(64, 96, yard);
    const tx = lerp(sx, ax, w), tz = lerp(sz, az, w);
    // 눈 높이·초점 거리: 화면이 높을수록(폴드) 눈을 높인다
    const hBase = clamp(H * 0.445, 232, 330);
    const tf = lerp(770, lerp(600, 660, yard), w), th = hBase * lerp(1, lerp(0.94, 1.06, yard), w);
    // 높이는 '바닥' 높이만 따라간다 (단상·상자 위에 올라서면 영웅이 화면에서 올라간다)
    let fy = -Infinity; for (const s of st.slabs) if (s.kind === 'floor' && !s.pit && h.x >= s.x0 && h.x <= s.x1 && h.z >= s.z0 && h.z <= s.z1 && s.top > fy) fy = s.top;
    if (fy > -Infinity) this.floorY = fy;
    if (snap) { cam.x = tx; cam.z = tz; cam.y = this.floorY; cam.f = tf; cam.h = th; this.R?.tick(0, st.sectionAt(h.x, h.z).id, true); return; }
    const kx = 1 - Math.exp(-dt * 5.5), kz = 1 - Math.exp(-dt * 4.5);
    cam.x += (tx - cam.x) * kx; cam.z += (tz - cam.z) * kz; cam.y += (this.floorY - cam.y) * (1 - Math.exp(-dt * 5));
    cam.f += (tf - cam.f) * kz; cam.h += (th - cam.h) * kz;
    void PIT_Y; void WALL;
  }

  _now() { const g = this.game; return g.__qaRealNow ? g.__qaRealNow() : performance.now(); }
  update(dt) {
    const t0 = this._now();
    this.t += dt;
    const g = this.game, P = this.play;
    if (input.pressed('menu')) { this.paused = !this.paused; g.audio?.sfx?.('select'); }
    if (this.paused) {
      if (this._tap('resume') || input.pressed('confirm')) this.paused = false;
      else if (this._tap('title') || input.pressed('map')) { if (g.registry.title) g.go('title', {}, { fade: true }); }
      input.consume?.('attack'); input.consume?.('jump');
      this.updMs += this._now() - t0;
      return;
    }
    P.update(dt);
    this._cam(dt, false);
    this.R.tick(dt, P.done ? 'yard' : P.section);
    if (P.done && P.doneT > 0.8 && (this._tap('again') || input.pressed('confirm') && P.doneT > 1.5)) { P.restart(); this._cam(1, true); }
    this.updMs += this._now() - t0;
  }
  _tap(id) { const r = this.btns[id], p = input.pointer; return !!(r && p.tapped && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h); }

  render(ctx) {
    const t0 = this._now();
    const g = this.game, W = g.viewW, H = g.viewH || 540, P = this.play, cam = this.cam, R = this.R;
    // 화면 흔들림 (트라우마²)
    cam.zoom = clamp(H / 560, 1, 1.32);      // 폴드(높이 726)는 1.3배: 캐릭터가 화면 높이의 15 % 쯤 되게
    const tr = P.trauma * P.trauma * (g.settings?.shake === false ? 0 : 1), tt = this.t * 60;
    cam.setView(W, H, Math.sin(tt * 1.7) * 9 * tr, Math.cos(tt * 2.3) * 7 * tr);
    R.draw(ctx, cam, P.list());
    P.drawFx(ctx, cam, R);
    // 가장자리 어둠 + 피격 붉은 빛
    if (P.vig > 0) { ctx.fillStyle = `rgba(160,10,20,${0.22 * P.vig})`; ctx.fillRect(0, 0, W, H); }
    this._hud(ctx, W, H);
    this.frame[this.fi] = this._now() - t0 + this.updMs; this.fi = (this.fi + 1) % this.frame.length; this.fn++; this.updMs = 0;
  }

  _hud(ctx, W, H) {
    const g = this.game, P = this.play, h = P.hero, sf = g.safe || { l: 0, t: 0, r: 0, b: 0 };
    const x = sf.l + 18, y = sf.t + 16;
    ui.text(ctx, '카엘', x, y + 15, { size: 17, weight: 700, color: '#f0e2c8' });
    ui.bar(ctx, x + 50, y, 220, 16, h.hp / h.maxHp, { ghost: h.ghostHp / h.maxHp });
    ui.text(ctx, `${Math.ceil(h.hp)}`, x + 50 + 110, y + 13, { size: 12, align: 'center', weight: 700, color: '#fff', ow: 2 });
    let left = 0, yard = 0; for (const e of P.enemies) if (!e.dead) { left++; if (e.group === 'yard') yard++; }
    const sec = P.done ? 'done' : P.section;
    ui.text(ctx, `${SEC_NAME[sec] || ''}  ·  남은 적 ${sec === 'yard' ? yard : left}`, x, y + 42, { size: 14, color: '#c8b8a8', ow: 2 });
    if (this.debug) {
      const f = this.frameStats(), c = this.cam;
      ui.text(ctx, `${f.p50} / ${f.p95} ms  strips ${this.R.stats.strips} faces ${this.R.stats.faces} items ${this.R.stats.items}  cam ${c.x | 0},${c.z | 0},${c.y | 0} f${c.f | 0}  hero ${h.x | 0},${h.z | 0},${h.y | 0}`, x, y + 62, { size: 12, color: '#9fd0a0', ow: 2 });
    }
    if (this.t < 9 && !P.done && !this.paused) {
      const a = clamp((9 - this.t) / 1.5, 0, 1); ctx.globalAlpha = a;
      if (input.mode !== 'touch') ui.text(ctx, '방향키 이동 (위·아래 = 앞뒤)  ·  Z 점프  ·  X 공격  ·  C 대시  ·  Enter 일시정지', W / 2, H - 14, { size: 13, align: 'center', color: '#b8a898', ow: 2 });
      else ui.text(ctx, '스틱 위·아래 = 앞뒤 이동', W / 2, sf.t + 86, { size: 16, align: 'center', color: '#e8d8c0', ow: 3 });
      ctx.globalAlpha = 1;
    }
    this.btns = {};
    if (P.done) {
      const k = clamp(P.doneT / 0.5, 0, 1);
      ctx.fillStyle = `rgba(6,3,10,${0.5 * k})`; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = k;
      ui.text(ctx, '시범 구간 끝', W / 2, H * 0.4, { size: 46, align: 'center', weight: 800, family: ui.FONT.title, color: '#ffd9a0', ow: 6 });
      ui.text(ctx, `쓰러뜨린 적 ${P.kills}`, W / 2, H * 0.4 + 40, { size: 18, align: 'center', color: '#e8d8c0' });
      this._btn(ctx, 'again', '다시 시작', W / 2 - 120, H * 0.4 + 70, 240, 58);
      ctx.globalAlpha = 1;
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(6,3,10,0.62)'; ctx.fillRect(0, 0, W, H);
      ui.text(ctx, '일시정지', W / 2, H * 0.36, { size: 40, align: 'center', weight: 800, family: ui.FONT.title, color: '#f0e2c8', ow: 6 });
      this._btn(ctx, 'resume', '계속하기', W / 2 - 250, H * 0.36 + 44, 230, 58);
      this._btn(ctx, 'title', '타이틀로', W / 2 + 20, H * 0.36 + 44, 230, 58);
    }
  }
  _btn(ctx, id, label, x, y, w, h) {
    this.btns[id] = { x, y, w, h };
    ui.panel(ctx, x, y, w, h, {});
    ui.text(ctx, label, x + w / 2, y + h / 2 + 8, { size: 22, align: 'center', weight: 700, color: '#ffe8c0' });
  }
}
