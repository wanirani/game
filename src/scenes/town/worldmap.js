// 월드맵: 양피지 지도 위 13개 스테이지 + 투기장. 잠김/열림/클리어(랭크 인장), 흐르는 점선 경로, 유물 수, 스테이지 정보, 출발.
// 숨겨진 s13 은 유물 5개 + s12 클리어 시 지도에 모습을 드러낸다 (진입 시 연출과 함께 unlocked 에 추가).
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, panel, button, drawCover, vignette, FONT, COLORS, font } from '../../core/ui.js';
import { TAU, clamp, lerp, ease, fmt, fmtTime, rgba, rand } from '../../core/math.js';
import { Particles } from '../../core/particles.js';
import { STAGES, STAGE_ORDER, RELICS } from '../../data/stages.js';
import { SCRIPTS } from '../../data/story.js';
import { ITEMS } from '../../data/items.js';
import { CHARACTERS } from '../../data/characters.js';
import { currentHero } from '../../game/state.js';
import { drawIcon } from '../../render/icons.js';
import { hitRect, padHidden, ensureState, uiPanel, uiButton, uiHints } from './common.js';
import { glow } from './facades.js';

const RANK_COL = { SSS: '#ffe070', SS: '#ff5a4a', S: '#ffa640', A: '#c07cff', B: '#5aa8ff', C: '#7ee07e', D: '#a0a0a0' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
const INK = '#2a1608';
const VILLAGE = { x: 0.05, y: 0.9 };

export class WorldMapScene extends Scene {
  enter(params = {}) {
    const g = this.game, st = ensureState(g);
    this.world = params.world ?? null;
    this.fx = new Particles(500);
    this.reveal = null; this.depart = null;
    const P = st.progress;
    // 숨겨진 역성 해금
    if ((P.relics?.length ?? 0) >= 5 && P.cleared?.s12 && !P.unlocked.includes('s13')) {
      P.unlocked.push('s13');
      this.reveal = { t: 0 };
      audio.stopMusic?.(0.4);
      audio.sfx('boss_roar', { vol: 0.8 });
    } else audio.music('worldmap');
    this.nodes = [];
    for (const id of STAGE_ORDER) {
      if (id === 's13' && !P.unlocked.includes('s13')) continue;
      this.nodes.push({ id, stage: STAGES[id] });
    }
    if (STAGES.arena) this.nodes.push({ id: 'arena', stage: STAGES.arena, arena: true });
    // 기본 선택: 가장 최근에 열린 미클리어 스테이지
    let idx = 0;
    for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (!n.arena && P.unlocked.includes(n.id)) idx = i; }
    const fresh = this.nodes.findIndex((n) => !n.arena && P.unlocked.includes(n.id) && !P.cleared?.[n.id]);
    if (fresh >= 0) idx = fresh;
    if (this.reveal) idx = this.nodes.findIndex((n) => n.id === 's13');
    this.index = idx;
    this.tok = null; // 캐릭터 말 위치
    assets.preload(['bg/worldmap']);
    audio.sfx('card', { vol: 0.5 });
    padHidden(true);
  }
  exit() { padHidden(false); }
  get state() { return this.game.state; }
  isOpen(n) { return n.arena ? true : this.state.progress.unlocked.includes(n.id); }

  layout() {
    const vw = this.game.viewW, vh = this.game.viewH;
    // 위: 상단 바(0~58) + 맨 위 노드의 이름표 자리 / 아래: 정보 패널(vh-158 ~ vh-26) + 키 안내 줄(기준선 vh-8)
    return { vw, vh, mx: 56, my: 84, mw: vw - 112, mh: vh - 84 - 172 };
  }
  pos(mp) { const L = this.layout(); return { x: L.mx + mp.x * L.mw, y: L.my + mp.y * L.mh }; }

  update(dt) {
    this.fx.update(dt, null);
    const vw = this.game.viewW, vh = this.game.viewH;
    if (this.reveal) {
      const R = this.reveal; R.t += dt;
      const n = this.nodes[this.index], p = this.pos(n.stage.mapPos);
      if (R.t < 2 && Math.random() < 0.7) this.fx.emit('dark', p.x + rand(-30, 30), p.y + rand(-20, 20), { speed: 80 });
      if (!R.boom && R.t > 1.3) { R.boom = true; audio.sfx('thunderclap'); this.game.flash('#b060ff', 0.8, 2); this.fx.burst('magic', p.x, p.y, 60, { color: '#d080ff', speed: 300 }); this.fx.ring(p.x, p.y, { color: '#b060ff', r0: 10, r1: 220, life: 0.8, width: 8 }); }
      if (R.t > 3.2 || (R.t > 0.8 && (input.pressed('confirm') || input.pointer.tapped))) { this.reveal = null; audio.music('worldmap'); input.flush(); }
      return;
    }
    if (this.depart) { this.depart.t += dt; if (this.depart.t > 0.55 && !this.depart.gone) { this.depart.gone = true; this.launch(this.depart.id); } return; }
    const n = this.nodes.length;
    const mv = (d) => { this.index = (this.index + d + n) % n; audio.sfx('menu_move'); };
    if (input.pressed('left') || input.pressed('up')) mv(-1);
    if (input.pressed('right') || input.pressed('down')) mv(1);
    if (input.pointer.tapped) {
      if (this.closeRect && hitRect(this.closeRect)) { this.close(); return; }
      if (this.goRect && hitRect(this.goRect)) { this.start(); return; }
      for (let i = 0; i < this.nodes.length; i++) {
        const nd = this.nodes[i], p = this.pos(nd.stage.mapPos);
        if (Math.hypot(input.pointer.x - p.x, input.pointer.y - p.y) < 30) { if (i === this.index) this.start(); else { this.index = i; audio.sfx('menu_move'); } return; }
      }
    }
    if (input.pressed('confirm')) { this.start(); return; }
    if (input.pressed('cancel') || (input.pressed('menu') && !input.pressed('confirm'))) this.close();
    // 말 이동 (다른 노드·랭크 인장·이름표를 덜 가리는 자리에 선다)
    const tp = this.tokenSpot(this.nodes[this.index]);
    if (!this.tok) this.tok = { x: tp.x, y: tp.y };
    const k = 1 - Math.pow(0.0005, dt);
    this.tok.x = lerp(this.tok.x, tp.x, k); this.tok.y = lerp(this.tok.y, tp.y, k);
  }
  close() { audio.sfx('menu_cancel'); this.game.pop(); }

  start() {
    const n = this.nodes[this.index], g = this.game, st = this.state;
    if (!this.isOpen(n)) { audio.sfx('menu_cancel'); g.toast(n.stage.req ?? '이전 스테이지를 클리어하면 열린다.', '#ff8a7a'); return; }
    if (n.arena && !g.registry.arcade) { audio.sfx('menu_cancel'); g.toast('투기장의 문은 아직 굳게 닫혀 있다…', '#c8b8a0'); return; }
    audio.sfx('go'); audio.sfx('menu_ok');
    const p = this.pos(n.stage.mapPos);
    this.fx.burst('fire', p.x, p.y, 24, { speed: 160 });
    this.fx.ring(p.x, p.y, { color: '#ff4a5a', r0: 10, r1: 120, life: 0.5, width: 6 });
    this.depart = { t: 0, id: n.id };
    if (g.settings?.autoSave) { try { saves.write(st.slot ?? 1, st); } catch { /* 무시 */ } }
  }
  launch(id) {
    const g = this.game, st = this.state;
    if (id === 'arena') { g.go('arcade', { from: 'worldmap' }); return; }
    const stage = STAGES[id];
    st.lastStage = { stageId: id, roomId: null };
    const intro = stage.intro;
    const seen = st.progress.seenScripts?.includes(intro);
    if (g.registry.story && intro && SCRIPTS[intro] && !seen) {
      st.progress.seenScripts.push(intro);
      g.go('story', { script: intro, then: 'stage', thenParams: { stageId: id }, bg: stage.bg });
    } else g.go('stage', { stageId: id });
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const L = this.layout(), { vw, vh } = L, st = this.state, P = st.progress;
    const t = this.t;
    let zoom = 1;
    if (this.depart) zoom = 1 + ease.inCubic(Math.min(1, this.depart.t / 0.55)) * 0.35;
    ctx.save();
    if (zoom > 1) { const n = this.nodes[this.index], p = this.pos(n.stage.mapPos); ctx.translate(p.x, p.y); ctx.scale(zoom, zoom); ctx.translate(-p.x, -p.y); }
    drawCover(ctx, assets.get('bg/worldmap'), vw, vh, { fallback: ['#c8b48a', '#8a7450'] });
    // 따뜻한 등불 톤 + 가장자리 그을림
    ctx.fillStyle = 'rgba(40,20,10,0.18)'; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.75, '20,8,4');
    // 마을 → s01 경로 + 스테이지 경로
    const vp = this.pos(VILLAGE);
    const chain = STAGE_ORDER.filter((id) => id !== 's13').map((id) => this.nodes.find((n) => n.id === id)).filter(Boolean);
    this.path(ctx, vp, this.pos(chain[0].stage.mapPos), true, t, '#8a1426', 0);
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i], b = chain[i + 1];
      this.path(ctx, this.pos(a.stage.mapPos), this.pos(b.stage.mapPos), this.isOpen(b), t, '#8a1426', i + 1);
    }
    const s13 = this.nodes.find((n) => n.id === 's13');
    if (s13) this.path(ctx, this.pos(STAGES.s12.mapPos), this.pos(s13.stage.mapPos), true, t, '#7a20c0', 20, 1.6);
    // 마을 표시
    this.village(ctx, vp.x, vp.y);
    // 노드
    for (let i = 0; i < this.nodes.length; i++) this.node(ctx, this.nodes[i], i === this.index);
    // 말 (현재 캐릭터)
    if (this.tok && !this.reveal) this.token(ctx, this.tok.x, this.tok.y - 42 - Math.abs(Math.sin(t * 3)) * 5);
    this.fx.draw(ctx, 'back'); this.fx.draw(ctx, 'front');
    ctx.restore();
    // 상단 바
    const hg = ctx.createLinearGradient(0, 0, 0, 60);
    hg.addColorStop(0, 'rgba(8,3,6,0.92)'); hg.addColorStop(1, 'rgba(8,3,6,0.6)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, vw, 58);
    ctx.fillStyle = 'rgba(232,200,114,0.5)'; ctx.fillRect(0, 57, vw, 1.5);
    text(ctx, '월드맵', 22, 38, { size: 26, weight: 800, family: FONT.title, color: '#f3d690', ow: 4 });
    text(ctx, 'THE ROAD TO THE CASTLE', 118, 37, { size: 12, weight: 800, family: FONT.num, color: '#8a7a64' });
    // 유물
    const rx = vw - 72 - 5 * 34 - 110;
    text(ctx, '드라큘라의 유물', rx - 12, 36, { size: 12, weight: 700, color: '#c8b8a0', align: 'right' });
    RELICS.forEach((id, i) => {
      const has = P.relics?.includes(id);
      const cx = rx + 8 + i * 34, cy = 30;
      ctx.fillStyle = has ? 'rgba(120,10,24,0.85)' : 'rgba(10,4,10,0.7)'; ctx.beginPath(); ctx.arc(cx, cy, 14, 0, TAU); ctx.fill();
      ctx.strokeStyle = has ? '#ff6a7a' : '#4a3a30'; ctx.lineWidth = 1.5; ctx.stroke();
      if (has) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, cy, 22, '#ff3050', 0.4 + Math.sin(t * 3 + i) * 0.1); ctx.restore(); drawIcon(ctx, ITEMS[id]?.icon ?? `relic_${i + 1}`, cx, cy, 24); }
      else text(ctx, '?', cx, cy + 5, { size: 13, weight: 800, align: 'center', color: '#5a4a40', ow: 0 });
    });
    text(ctx, `${P.relics?.length ?? 0}/5`, rx + 5 * 34 + 6, 36, { size: 15, weight: 900, family: FONT.num, color: (P.relics?.length ?? 0) >= 5 ? '#ff6a7a' : '#efe4cf' });
    this.closeRect = { x: vw - 64, y: 9, w: 52, h: 40 };
    uiButton(ctx, this.closeRect, '✕', { size: 20 });
    this.info(ctx, L);
    if (this.reveal) this.drawReveal(ctx, L);
    if (this.depart) { ctx.fillStyle = `rgba(120,0,20,${Math.min(0.5, this.depart.t)})`; ctx.fillRect(0, 0, vw, vh); }
  }

  path(ctx, a, b, open, t, col, seed, wide = 1) {
    const mx = (a.x + b.x) / 2 + Math.sin(seed * 2.3) * 22, my = (a.y + b.y) / 2 + Math.cos(seed * 1.7) * 18;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y);
    if (open) {
      ctx.strokeStyle = 'rgba(240,225,190,0.55)'; ctx.lineWidth = 7 * wide; ctx.setLineDash([]); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 3.2 * wide; ctx.setLineDash([2, 9]); ctx.lineDashOffset = -t * 22; ctx.stroke();
      if (wide > 1) { ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba('#b060ff', 0.25 + Math.sin(t * 3) * 0.1); ctx.lineWidth = 10; ctx.setLineDash([]); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(60,40,20,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([1, 8]); ctx.stroke();
    }
    ctx.restore();
  }

  village(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = 'rgba(240,225,190,0.7)'; ctx.beginPath(); ctx.ellipse(x, y + 4, 26, 10, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK;
    for (const [dx, s] of [[-12, 0.8], [0, 1], [12, 0.85]]) {
      ctx.fillRect(x + dx - 6 * s, y - 8 * s, 12 * s, 10 * s);
      ctx.beginPath(); ctx.moveTo(x + dx - 8 * s, y - 8 * s); ctx.lineTo(x + dx, y - 16 * s); ctx.lineTo(x + dx + 8 * s, y - 8 * s); ctx.fill();
    }
    ctx.fillStyle = '#ffb45a'; ctx.fillRect(x - 2, y - 5, 3, 3);
    text(ctx, '에슈빌', x, y + 22, { size: 12, weight: 800, family: FONT.title, align: 'center', color: INK, outline: 'rgba(240,225,190,0.9)', ow: 3 });
    ctx.restore();
  }

  node(ctx, n, sel) {
    const st = this.state, P = st.progress, t = this.t;
    const p = this.pos(n.stage.mapPos);
    const open = this.isOpen(n), rec = P.cleared?.[n.id];
    const R = sel ? 21 : 17;
    ctx.save();
    if (sel) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, p.x, p.y, 62, n.id === 's13' ? '#b060ff' : '#ffb040', 0.45 + Math.sin(t * 4) * 0.1); ctx.restore();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 0.8);
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.arc(0, 0, R + 9, 0.15, TAU / 4 - 0.15); ctx.stroke(); }
      ctx.restore();
    }
    // 그림자
    ctx.fillStyle = 'rgba(40,20,10,0.35)'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + R * 0.7, R * 0.9, R * 0.35, 0, 0, TAU); ctx.fill();
    // 인장 몸체
    const g = ctx.createRadialGradient(p.x - R * 0.35, p.y - R * 0.4, 2, p.x, p.y, R);
    if (n.arena) { g.addColorStop(0, '#8a8a9a'); g.addColorStop(1, '#2a2a36'); }
    else if (!open) { g.addColorStop(0, '#8a8278'); g.addColorStop(1, '#3a342e'); }
    else if (rec) { g.addColorStop(0, '#ffe7a0'); g.addColorStop(0.6, '#c8a040'); g.addColorStop(1, '#6a4a10'); }
    else if (n.id === 's13') { g.addColorStop(0, '#e0a0ff'); g.addColorStop(0.6, '#7a20c0'); g.addColorStop(1, '#2a0840'); }
    else { g.addColorStop(0, '#ff6a7a'); g.addColorStop(0.6, '#a01020'); g.addColorStop(1, '#3a0408'); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = open ? '#1a0a04' : 'rgba(30,20,10,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', open ? 0.35 : 0.15); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, R - 3, Math.PI * 1.1, Math.PI * 1.8); ctx.stroke();
    // 문양
    if (n.arena) {
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x - 8, p.y + 8); ctx.lineTo(p.x + 8, p.y - 8); ctx.moveTo(p.x + 8, p.y + 8); ctx.lineTo(p.x - 8, p.y - 8); ctx.stroke();
    } else if (!open) {
      ctx.fillStyle = 'rgba(30,20,14,0.8)'; ctx.fillRect(p.x - 6, p.y - 2, 12, 9);
      ctx.strokeStyle = 'rgba(30,20,14,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y - 3, 4.5, Math.PI, 0); ctx.stroke();
    } else {
      text(ctx, ROMAN[n.stage.chapter] ?? '', p.x, p.y + 5, { size: sel ? 14 : 12, weight: 900, family: FONT.num, align: 'center', color: rec ? '#3a2006' : '#ffe7a0', outline: rec ? 'rgba(255,240,200,0.6)' : 'rgba(0,0,0,0.6)', ow: 2 });
    }
    // 랭크 인장
    if (rec?.rank) {
      const bx = p.x + R * 0.8, by = p.y - R * 0.8;
      ctx.fillStyle = '#1a0a08'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = RANK_COL[rec.rank] ?? '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      text(ctx, rec.rank, bx, by + 4, { size: rec.rank.length > 1 ? 8 : 11, weight: 900, family: FONT.num, align: 'center', color: RANK_COL[rec.rank] ?? '#fff', ow: 0 });
    }
    // 유물 표식
    if (n.stage.relic && open) {
      const has = P.relics?.includes(n.stage.relic);
      ctx.fillStyle = has ? '#ff3050' : 'rgba(90,10,20,0.6)'; ctx.beginPath(); ctx.moveTo(p.x - R * 0.9, p.y + R * 0.4); ctx.lineTo(p.x - R * 0.9 - 5, p.y + R * 0.4 + 7); ctx.lineTo(p.x - R * 0.9 + 5, p.y + R * 0.4 + 7); ctx.closePath(); ctx.fill();
    }
    // 이름
    if (open || sel) {
      const label = open ? n.stage.name : '???';
      const ly = this.labelSide(n) < 0 ? Math.max(74, p.y - R - (rec?.rank ? 16 : 9)) : p.y + R + 16; // 위쪽 이름표는 상단 바(0~58)에 가리지 않게
      text(ctx, label, p.x, ly, { size: sel ? 14 : 12, weight: 800, family: FONT.title, align: 'center', color: sel ? '#5a0a10' : INK, outline: 'rgba(245,232,200,0.92)', ow: 4 });
    }
    ctx.restore();
  }

  /** 이름표 위치(아래 +1 / 위 -1): 다른 노드·이름표와 덜 겹치는 쪽. 화면 폭이 바뀌면 다시 계산 */
  labelSide(n) {
    const vw = this.game.viewW;
    if (this._lbW !== vw) {
      this._lbW = vw; this._lb = new Map(); this._lbBoxes = [];
      const boxes = [];
      const hitN = (bx) => this.nodes.reduce((a, o) => { const q = this.pos(o.stage.mapPos); return a + (q.x + 22 > bx.x && q.x - 22 < bx.x + bx.w && q.y + 22 > bx.y && q.y - 22 < bx.y + bx.h ? 1 : 0); }, 0);
      const hitB = (bx) => boxes.reduce((a, b) => a + (b.x < bx.x + bx.w && b.x + b.w > bx.x && b.y < bx.y + bx.h && b.y + b.h > bx.y ? 1 : 0), 0);
      for (const o of this.nodes) {
        const q = this.pos(o.stage.mapPos), w = (o.stage.name?.length ?? 4) * 13 + 8;
        const dn = { x: q.x - w / 2, y: q.y + 26, w, h: 16 }, up = { x: q.x - w / 2, y: q.y - 44, w, h: 16 };
        // 위쪽 이름표가 상단 바(0~58)에 걸리면 약간 감점 (그릴 때 바 아래로 내려 그린다)
        const sd = hitN(dn) * 2 + hitB(dn), su = hitN(up) * 2 + hitB(up) + 0.5 + (up.y < 62 ? 1 : 0);
        const side = su < sd ? -1 : 1;
        this._lb.set(o.id, side); boxes.push(side < 0 ? up : dn);
      }
      this._lbBoxes = boxes;
    }
    return this._lb.get(n.id) ?? 1;
  }

  /**
   * 말(현재 캐릭터 초상화 표식)의 자리. 반환값은 this.tok 좌표계(표식 원 중심 + 42).
   * 노드 위 → 왼쪽 → 오른쪽 → 대각선 후보 중 다른 노드·랭크 인장·이름표·상단 바·정보 패널과 가장 덜 겹치는 곳.
   */
  tokenSpot(n) {
    const L = this.layout();
    this.labelSide(n);
    if (this._tkW !== L.vw || this._tkN !== this.nodes.length) { this._tkW = L.vw; this._tkN = this.nodes.length; this._tk = new Map(); }
    if (!this._tk.has(n.id)) {
      const P = this.state.progress, q = this.pos(n.stage.mapPos), TR = 19;
      const obst = [];
      for (const o of this.nodes) {
        const qo = this.pos(o.stage.mapPos);
        if (o !== n) obst.push([qo.x, qo.y, 22]);
        if (P.cleared?.[o.id]?.rank) obst.push([qo.x + 17, qo.y - 17, 11]);
      }
      const vp = this.pos(VILLAGE); obst.push([vp.x, vp.y - 4, 28]);
      const cands = [[0, -44, 0], [-50, -8, 0.3], [50, -8, 0.4], [-40, -34, 0.6], [42, -38, 0.7]];
      let best = null, bestS = Infinity;
      for (const [dx, dy, pref] of cands) {
        const cx = q.x + dx, cy = q.y + dy;
        let sc = pref;
        for (const [ox, oy, r] of obst) { const d = Math.hypot(cx - ox, cy - oy); if (d < TR + r) sc += 4 * (1 - d / (TR + r)) + 1; }
        for (const b of this._lbBoxes ?? []) if (cx + TR > b.x && cx - TR < b.x + b.w && cy + TR > b.y && cy - TR < b.y + b.h) sc += 2;
        if (cy - TR < 62 || cx - TR < 4 || cx + TR > L.vw - 4 || cy + 26 > L.my + L.mh + 40) sc += 6;
        if (sc < bestS) { bestS = sc; best = { x: cx, y: cy + 42 }; }
      }
      this._tk.set(n.id, best);
    }
    return this._tk.get(n.id);
  }

  token(ctx, x, y) {
    const hero = currentHero(this.state), ch = CHARACTERS[hero.charId];
    const img = assets.get(ch.portrait);
    ctx.save();
    ctx.fillStyle = '#1a0a0c'; ctx.beginPath(); ctx.moveTo(x - 7, y + 14); ctx.lineTo(x, y + 26); ctx.lineTo(x + 7, y + 14); ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fillStyle = '#12060c'; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.clip();
    if (img) ctx.drawImage(img, x - 24, y - 14, 48, 48 * (img.height / img.width));
    ctx.restore();
    ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  info(ctx, L) {
    const { vw, vh } = L, st = this.state, P = st.progress;
    const n = this.nodes[this.index], s = n.stage, open = this.isOpen(n), rec = P.cleared?.[n.id];
    const x = 14, y = vh - 158, w = vw - 28, h = 132;
    uiPanel(ctx, x, y, w, h, { glow: n.id === 's13' ? 'rgba(160,60,255,0.5)' : 'rgba(180,20,40,0.35)' });
    // 제목
    const chapTxt = n.arena ? 'ARENA' : `CHAPTER ${ROMAN[s.chapter] ?? s.chapter}`;
    text(ctx, chapTxt, x + 24, y + 26, { size: 12, weight: 800, family: FONT.num, color: n.id === 's13' ? '#d8a0ff' : '#c8a060' });
    text(ctx, open ? s.name : '??? — 봉인된 땅', x + 24, y + 58, { size: 26, weight: 800, family: FONT.title, color: open ? '#f3d690' : '#8a7a70', maxWidth: w * 0.36 });
    text(ctx, open ? (s.sub ?? '') : (s.req ?? '이전 스테이지를 클리어하면 길이 열린다.'), x + 24, y + 84, { size: 13, color: '#c8b8a0', maxWidth: w * 0.38 });
    const hero = currentHero(st);
    if (open && !n.arena) {
      const danger = hero.level < s.level - 2;
      text(ctx, `적 레벨 ${s.level}`, x + 24, y + 112, { size: 13, weight: 800, color: danger ? '#ff6a5a' : '#9d8f80' });
      if (danger) text(ctx, '⚠ 위험 — 레벨을 더 올리자', x + 110, y + 112, { size: 12, weight: 700, color: '#ff8a6a' });
    } else if (n.arena) text(ctx, '끝없이 몰려오는 적과 역대 보스에 도전한다', x + 24, y + 112, { size: 12, color: '#9d8f80' });
    // 기록
    const cx = x + w * 0.42;
    ctx.fillStyle = 'rgba(232,200,114,0.25)'; ctx.fillRect(cx - 16, y + 16, 1.5, h - 32);
    if (!n.arena) {
      text(ctx, '최고 기록', cx, y + 28, { size: 12, weight: 700, color: '#9d8f80' });
      if (rec) {
        const rc = RANK_COL[rec.rank] ?? '#fff';
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx + 30, y + 72, 40, rc, 0.3); ctx.restore();
        text(ctx, rec.rank ?? '-', cx + 30, y + 90, { size: 44, weight: 900, family: FONT.logo, align: 'center', color: rc, ow: 5 });
        text(ctx, `시간  ${fmtTime(rec.time ?? 0)}`, cx + 78, y + 64, { size: 14, weight: 700, family: FONT.num, color: '#efe4cf' });
        text(ctx, `점수  ${fmt(rec.score ?? 0)}`, cx + 78, y + 88, { size: 14, weight: 700, family: FONT.num, color: '#ffd84a' });
      } else text(ctx, open ? '아직 클리어하지 않았다' : '—', cx, y + 64, { size: 14, color: '#8a7a70' });
      // 비전서 · 유물
      const docs = s.docs || [];
      const found = docs.filter((d) => P.docs?.includes(d)).length;
      text(ctx, '비전서', cx, y + 116, { size: 12, color: '#9d8f80' });
      docs.forEach((d, i) => { const has = P.docs?.includes(d); ctx.globalAlpha = has ? 1 : 0.3; drawIcon(ctx, 'doc', cx + 58 + i * 26, y + 111, 22); ctx.globalAlpha = 1; });
      if (!docs.length) text(ctx, '없음', cx + 50, y + 116, { size: 12, color: '#6a5a50' });
      else text(ctx, `${found}/${docs.length}`, cx + 60 + docs.length * 26, y + 116, { size: 12, weight: 800, family: FONT.num, color: found === docs.length ? '#8ae0a0' : '#c8b8a0' });
      if (s.relic) {
        const has = P.relics?.includes(s.relic);
        const rx2 = cx + 170;
        text(ctx, '유물', rx2, y + 116, { size: 12, color: '#9d8f80' });
        ctx.globalAlpha = has ? 1 : 0.35; drawIcon(ctx, ITEMS[s.relic]?.icon ?? 'relic_1', rx2 + 44, y + 111, 24); ctx.globalAlpha = 1;
        text(ctx, has ? (ITEMS[s.relic]?.name ?? '') : '어딘가에 잠들어 있다', rx2 + 62, y + 116, { size: 12, weight: 700, color: has ? '#ff8a9a' : '#8a6a6a', maxWidth: w - (rx2 - x) - 250 });
      }
    }
    // 출발 버튼
    const bw = 190, bh = 64;
    this.goRect = { x: x + w - bw - 18, y: y + h / 2 - bh / 2, w: bw, h: bh };
    const can = open && (!n.arena || this.game.registry.arcade);
    ctx.save();
    if (can) { ctx.shadowColor = `rgba(255,80,90,${0.4 + Math.sin(this.t * 4) * 0.2})`; ctx.shadowBlur = 18; }
    uiButton(ctx, this.goRect, can ? (n.arena ? '입장' : '출발!') : '잠김', { selected: can, disabled: !can, size: 22, sub: can && !n.arena && rec ? '다시 도전' : undefined });
    ctx.restore();
    uiHints(ctx, [[['←', '→'], '스테이지'], ['Z', '출발'], ['X', '마을로']], vw / 2, vh - 8);
  }

  drawReveal(ctx, L) {
    const { vw, vh } = L, R = this.reveal, t = R.t;
    const n = this.nodes[this.index], p = this.pos(n.stage.mapPos);
    ctx.save();
    ctx.fillStyle = `rgba(10,0,20,${Math.min(0.55, t * 0.6)})`; ctx.fillRect(0, 0, vw, vh);
    // 균열
    const k = clamp(t / 1.3, 0, 1);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, p.x, p.y, 40 + k * 160, '#b060ff', 0.3 + k * 0.5);
    ctx.strokeStyle = `rgba(220,160,255,${k})`; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.3; let x = p.x, y = p.y; ctx.moveTo(x, y);
      for (let j = 1; j <= 4; j++) { x += Math.cos(a + Math.sin(i * 3 + j) * 0.6) * 22 * k; y += Math.sin(a + Math.cos(i * 2 + j) * 0.6) * 22 * k; ctx.lineTo(x, y); }
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    if (t > 1.3) {
      const e = ease.outBack(Math.min(1, (t - 1.3) * 2.5));
      ctx.translate(vw / 2, vh * 0.36); ctx.scale(e, e);
      text(ctx, '심연의 역성', 0, 0, { size: 44, weight: 900, family: FONT.title, align: 'center', color: '#e0b0ff', ow: 6, outline: '#1a0030' });
      text(ctx, '다섯 유물이 공명하며 거꾸로 선 성이 모습을 드러냈다', 0, 36, { size: 16, weight: 700, align: 'center', color: '#f0e0ff', ow: 4 });
    }
    ctx.restore();
  }
}
