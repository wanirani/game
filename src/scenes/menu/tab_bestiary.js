// 도감 탭: 적(ENEMIES)·보스(BOSSES) 목록(장별 묶음) · 처치 수 · 실시간 렌더 미리보기(스테이지 배경 위) · 약점/내성/드롭/설명
// 처치한 적만 정보 공개, 미발견은 실루엣
import { text, FONT, drawCover } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, rgba } from '../../core/math.js';
import { assets } from '../../core/assets.js';
import { drawEnemy } from '../../render/enemies.js';
import { Tab } from './base.js';
import {
  PAL, EL, frame, heading, divider, selBar, brackets, glow, glowOval, gauge, pill, para, rr, glyph, ellipsize, measure,
  Scroller, scrollbar, clipBegin, clipEnd,
} from './common.js';
import * as D from './access.js';

const ANIMS = [['idle', 2.6], ['walk', 2.2], ['idle', 1.4], ['attack', 1.1]];
const MAT_NAME = { flesh: '살점', bone: '뼈', metal: '금속', ghost: '영체', stone: '석재', slime: '점액', paper: '종이', ice: '얼음', fire: '화염', water: '물', wood: '나무' };

export class BestiaryTab extends Tab {
  constructor(m) {
    super(m);
    this.i = 0; this.sc = new Scroller();
    this.rows = null; this.rowRects = [];
    this.ent = null; this.entId = null; this.at = 0; this.ai = 0;
    this.sil = null; // 실루엣용 작은 캔버스
  }
  free() { if (this.sil) { this.sil.width = this.sil.height = 1; this.sil = null; } }
  build() {
    const E = D.ENEMIES(), B = D.BOSSES(), S = D.STAGES();
    const rows = [], seen = new Set();
    const skip = (d) => !d || d.hidden || d.noBestiary || d.render === 'none' || /spawner/.test(d.id);
    const push = (id, boss = false) => { if (seen.has(id)) return; const d = boss ? B[id] : E[id]; if (skip(d)) return; seen.add(id); rows.push({ id, boss, def: d, no: 0 }); };
    const common = Object.values(E).filter((d) => !Object.values(S).some((s) => (s.enemies || []).includes(d.id))).map((d) => d.id);
    if (common.length) { rows.push({ header: '공용 · 어디서나' }); common.forEach((id) => push(id)); }
    for (const sid of D.STAGE_ORDER()) {
      const st = S[sid];
      const ids = (st?.enemies || []).filter((id) => E[id] && !seen.has(id) && !skip(E[id]));
      if (!ids.length) continue;
      rows.push({ header: D.stageLabel(sid), sid });
      ids.forEach((id) => push(id));
    }
    const bossIds = D.STAGE_ORDER().map((sid) => S[sid]?.boss).filter((id) => id && B[id]);
    for (const id of Object.keys(B)) if (!bossIds.includes(id)) bossIds.push(id);
    if (bossIds.length) { rows.push({ header: '보스' }); bossIds.forEach((id) => push(id, true)); }
    let n = 0;
    for (const r of rows) if (!r.header) r.no = ++n;
    this.rows = rows;
    this.entries = rows.filter((r) => !r.header);
    this.i = clamp(this.i, 0, Math.max(0, this.entries.length - 1));
  }
  kills(r) {
    if (r.boss) return (this.state.progress?.bosses || []).includes(r.id) ? 1 : 0;
    const v = this.state.bestiary?.[r.id] ?? this.game.meta?.bestiary?.[r.id];
    return typeof v === 'number' ? v : (v?.kills ?? v?.seen ?? 0);
  }
  stageOf(r) {
    if (r.boss) return r.def.stageId ?? Object.values(D.STAGES()).find((s) => s.boss === r.id)?.id;
    return Object.values(D.STAGES()).find((s) => (s.enemies || []).includes(r.id))?.id;
  }
  onShow() { if (!this.rows) this.build(); }

  update(dt, nav, ges, focused) {
    if (!this.rows) this.build();
    this.at += dt;
    const ph = ANIMS[this.ai];
    if (this.at > ph[1]) { this.at = 0; this.ai = (this.ai + 1) % ANIMS.length; }
    this.sc.update(dt, this.listRect, ges);
    if (!this.sc.dragging) {
      for (const r of this.rowRects) {
        if (!r) continue;
        if (ges.hoverIn(r) && this.i !== r.k) this.i = r.k;
        if (ges.tap(r)) { this.m.focus = 'content'; if (this.i !== r.k) audio.sfx('menu_move'); this.i = r.k; return; }
      }
    }
    if (!focused) return;
    const n = this.entries.length;
    if (nav.up) { if (this.i > 0) { this.i--; audio.sfx('menu_move'); } else { this.m.focusTabs(); return; } }
    if (nav.down && this.i < n - 1) { this.i++; audio.sfx('menu_move'); }
    if (nav.left) { this.i = Math.max(0, this.i - 8); audio.sfx('menu_move'); }
    if (nav.right) { this.i = Math.min(n - 1, this.i + 8); audio.sfx('menu_move'); }
    if (nav.cancel) this.m.focusTabs();
  }
  hints() { return [['↑↓', '고르기'], ['←→', '8칸씩'], ['', '', '끌어서 목록을 넘기세요']].filter((h) => h[0]); }

  render(ctx, A) {
    if (!this.rows) this.build();
    const t = this.t, focused = this.m.focus === 'content';
    const LW = Math.round(clamp(A.w * 0.36, 300, 400));
    frame(ctx, A.x, A.y, LW, A.h);
    const found = this.entries.filter((r) => this.kills(r) > 0).length;
    heading(ctx, '마물 도감', A.x + 16, A.y + 26, LW - 32, { sub: `${found} / ${this.entries.length}` });
    gauge(ctx, A.x + LW - 110, A.y + 17, 90, 5, this.entries.length ? found / this.entries.length : 0, '#e8c872', { glowEnd: false });
    const LR = { x: A.x + 8, y: A.y + 40, w: LW - 16, h: A.h - 48 };
    this.listRect = LR;
    // 행 위치 계산 (머리줄 26, 항목 34)
    const HH = 28, RH = 34;
    let yy = 0, selTop = 0;
    const pos = this.rows.map((r) => { const y = yy; yy += r.header ? HH : RH; return y; });
    let k = 0;
    this.rows.forEach((r, j) => { if (!r.header) { if (k === this.i) selTop = pos[j]; k++; } });
    this.sc.setMax(yy - LR.h);
    this.sc.ensure(selTop, selTop + RH, LR.h, 30);
    clipBegin(ctx, LR);
    this.rowRects.length = 0;
    k = 0;
    this.rows.forEach((r, j) => {
      const y = LR.y + pos[j] - this.sc.y;
      if (r.header) {
        if (y > LR.y - HH && y < LR.y + LR.h) {
          text(ctx, r.header, LR.x + 10, y + 19, { size: 12, weight: 800, family: FONT.title, color: PAL.gold, ow: 2 });
          const tw = measure(ctx, r.header, 12, 800, FONT.title);
          ctx.fillStyle = 'rgba(200,160,90,0.3)'; ctx.fillRect(LR.x + 18 + tw, y + 15, LR.w - 36 - tw, 1);
        }
        return;
      }
      const kk = k++;
      const rect = { x: LR.x, y, w: LR.w - 8, h: RH - 3, k: kk };
      this.rowRects.push(rect);
      if (y > LR.y + LR.h || y + RH < LR.y) return;
      const sel = kk === this.i, n = this.kills(r);
      if (sel) selBar(ctx, rect.x, rect.y, rect.w, rect.h, t, { dim: !focused });
      text(ctx, `No.${String(r.no).padStart(3, '0')}`, rect.x + 14, rect.y + 21, { size: 11, weight: 700, family: FONT.num, color: n ? PAL.dim : PAL.faint, ow: 2 });
      text(ctx, n ? ellipsize(ctx, r.def.name, rect.w - 150, 14, 800) : '???', rect.x + 74, rect.y + 21, { size: 14, weight: 800, color: n ? (sel ? PAL.goldHi : r.boss ? '#ffb070' : PAL.bone) : PAL.faint, ow: 3 });
      if (r.boss) { if (n) glyph(ctx, 'crown', rect.x + rect.w - 18, rect.y + 16, 14, '#ffd070', 1.4); }
      else if (n) text(ctx, `${n.toLocaleString('ko-KR')}`, rect.x + rect.w - 12, rect.y + 21, { size: 12, align: 'right', weight: 800, family: FONT.num, color: PAL.text, ow: 2 });
    });
    clipEnd(ctx, LR, this.sc);
    scrollbar(ctx, LR.x + LR.w - 4, LR.y, LR.h, this.sc, LR.h);
    this.drawDetail(ctx, A.x + LW + 12, A.y, A.w - LW - 12, A.h, this.entries[this.i]);
  }

  fakeEnt(r) {
    if (this.entId !== r.id) {
      const d = r.def;
      this.ent = {
        def: d, id: d.id, t: 0, anim: 'idle', animT: 0, state: 'idle', stateT: 0, flashT: 0, stun: 0, params: { ...(d.aiParams || {}) },
        facing: -1, scale: 1, elite: false, dying: 0, vx: 0, vy: 0, alpha: 1, life: 5, onGround: !d.flying, hp: 1, maxHp: 1,
        w: d.size?.w ?? 40, h: d.size?.h ?? 60, cx: 0, bottom: 0, x: 0, y: 0,
      };
      this.entId = r.id; this.at = 0; this.ai = 0;
    }
    return this.ent;
  }

  drawPreview(ctx, r, x, y, w, h, seen) {
    const t = this.t;
    ctx.save();
    rr(ctx, x, y, w, h, 4); ctx.clip();
    const sid = this.stageOf(r);
    const bgKey = D.STAGES()[sid]?.bg;
    const img = bgKey ? assets.get(bgKey) : null;
    drawCover(ctx, img, w, h, { fallback: ['#1a1024', '#06030a'] });
    ctx.restore();
    // drawCover 는 (0,0) 기준이므로 위치 보정: 다시 그림
    ctx.save();
    rr(ctx, x, y, w, h, 4); ctx.clip();
    if (img) {
      const s = Math.max(w / img.width, h / img.height);
      ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) * 0.55, img.width * s, img.height * s);
    } else { const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#1a1024'); g.addColorStop(1, '#06030a'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h); }
    ctx.fillStyle = 'rgba(6,3,10,0.55)'; ctx.fillRect(x, y, w, h);
    const vg = ctx.createRadialGradient(x + w / 2, y + h * 0.6, h * 0.15, x + w / 2, y + h * 0.6, w * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = vg; ctx.fillRect(x, y, w, h);
    const floor = y + h - 22;
    if (!r.boss) {
      const fg = ctx.createLinearGradient(0, floor, 0, y + h);
      fg.addColorStop(0, 'rgba(30,18,24,0.85)'); fg.addColorStop(1, 'rgba(4,2,4,1)');
      ctx.fillStyle = fg; ctx.fillRect(x, floor, w, y + h - floor);
      ctx.fillStyle = 'rgba(220,170,110,0.2)'; ctx.fillRect(x, floor, w, 1);
    }
    if (r.boss) this.drawBossArt(ctx, r, x, y, w, h, seen, t);
    else this.drawEnemyArt(ctx, r, x, y, w, h, floor, seen, t);
    ctx.restore();
    ctx.strokeStyle = 'rgba(200,160,90,0.45)'; ctx.lineWidth = 1; rr(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke();
  }

  drawEnemyArt(ctx, r, x, y, w, h, floor, seen, t) {
    const d = r.def, e = this.fakeEnt(r);
    const sw = d.size?.w ?? 40, shh = d.size?.h ?? 60;
    const sc = Math.min(2.4, (h - 60) / shh, (w - 60) / (sw * 1.3));
    const ph = ANIMS[this.ai];
    e.t = t; e.anim = ph[0]; e.state = ph[0]; e.animT = this.at; e.stateT = this.at;
    e.scale = sc; e.w = sw * sc; e.h = shh * sc;
    e.cx = x + w / 2;
    e.bottom = d.flying ? y + h * 0.5 + (shh * sc) / 2 + Math.sin(t * 2) * 6 : floor;
    // 발밑 그림자 + 뒤쪽 기운
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.ellipse(e.cx, floor + 1, sw * sc * 0.55, 6, 0, 0, Math.PI * 2); ctx.fill();
    const acc = d.light?.color || (d.weak?.[0] && EL[d.weak[0]] ? '#b43048' : '#8a2030');
    if (seen) glow(ctx, e.cx, e.bottom - shh * sc * 0.5, Math.max(60, shh * sc * 0.9), acc.startsWith('#') ? acc : '#8a2030', 0.25);
    if (seen) {
      try { drawEnemy(ctx, e, null); } catch (err) { if (!this._err) { console.warn('[도감]', d.id, err); this._err = true; } }
    } else this.silhouette(ctx, x, y, w, h, (c) => { try { drawEnemy(c, e, null); } catch (err) { /* 무시 */ } });
  }

  drawBossArt(ctx, r, x, y, w, h, seen, t) {
    const img = assets.get(r.def.portrait ?? `portraits/${r.id}`);
    const draw = (c) => {
      if (img) {
        const s = Math.max(w / img.width, (h + 30) / img.height) * (1 + 0.02 * Math.sin(t * 0.8));
        c.drawImage(img, x + (w - img.width * s) / 2, y - 6 - (s - Math.max(w / img.width, (h + 30) / img.height)) * img.height * 0.3, img.width * s, img.height * s);
      } else { c.fillStyle = '#301020'; c.beginPath(); c.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2); c.fill(); }
    };
    if (seen) {
      draw(ctx);
      const g = ctx.createLinearGradient(0, y + h * 0.55, 0, y + h);
      g.addColorStop(0, 'rgba(6,3,10,0)'); g.addColorStop(1, 'rgba(6,3,10,0.9)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    } else this.silhouette(ctx, x, y, w, h, draw);
  }

  /** 오프스크린에 그린 뒤 검게 칠해 실루엣으로 */
  silhouette(ctx, x, y, w, h, fn) {
    const sc = Math.min(2, this.game.scale);
    const pw = Math.ceil(w * sc), ph = Math.ceil(h * sc);
    if (!this.sil) this.sil = document.createElement('canvas');
    const c = this.sil;
    if (c.width !== pw || c.height !== ph) { c.width = pw; c.height = ph; }
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, pw, ph);
    g.setTransform(sc, 0, 0, sc, -x * sc, -y * sc);
    g.globalCompositeOperation = 'source-over';
    fn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#06030a'; g.fillRect(0, 0, pw, ph);
    g.globalCompositeOperation = 'source-over';
    // 테두리 역광처럼 살짝 밝은 복제 먼저
    ctx.save();
    ctx.globalAlpha *= 0.5; ctx.filter = 'none';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha *= 0.25;
    ctx.drawImage(c, 0, 0, pw, ph, x - 1.5, y - 1.5, w, h);
    ctx.restore();
    ctx.drawImage(c, 0, 0, pw, ph, x, y, w, h);
    text(ctx, '?', x + w / 2, y + h / 2 + 14, { size: 40, align: 'center', weight: 900, family: FONT.num, color: 'rgba(200,170,140,0.35)', ow: 0 });
  }

  drawDetail(ctx, x, y, w, h, r) {
    frame(ctx, x, y, w, h);
    if (!r) { text(ctx, '도감 정보가 없습니다', x + w / 2, y + h / 2, { size: 14, align: 'center', color: PAL.faint }); return; }
    const n = this.kills(r), seen = n > 0, d = r.def;
    const ph = Math.round(h * 0.47);
    this.drawPreview(ctx, r, x + 10, y + 10, w - 20, ph, seen);
    // 번호 / 처치 수 배지
    pill(ctx, `No.${String(r.no).padStart(3, '0')}`, x + 18, y + 18, { size: 11, h: 18, color: PAL.gold });
    if (seen) pill(ctx, r.boss ? '토벌 완료' : `처치 ${n.toLocaleString('ko-KR')}`, x + w - 18, y + 18, { align: 'right', size: 11, h: 18, color: r.boss ? '#ffd070' : PAL.bone, bg: 'rgba(90,10,30,0.9)' });
    let cy = y + ph + 40;
    const sid = this.stageOf(r);
    if (!seen) {
      text(ctx, '???', x + 20, cy, { size: 22, weight: 800, family: FONT.title, color: PAL.faint });
      text(ctx, sid ? `출현: ${D.stageLabel(sid)}` : '', x + w - 20, cy, { size: 12, align: 'right', weight: 700, color: PAL.dim });
      divider(ctx, x + 14, cy + 12, w - 28);
      para(ctx, r.boss ? '아직 쓰러뜨리지 못한 강대한 존재. 그 정체는 어둠에 싸여 있다.' : '아직 쓰러뜨린 적이 없는 마물이다. 처치하면 자세한 정보가 기록된다.', x + 20, cy + 40, w - 40, { size: 13, color: PAL.dim, max: 3 });
      return;
    }
    text(ctx, d.name, x + 20, cy, { size: 22, weight: 800, family: FONT.title, color: r.boss ? '#ffd9a0' : PAL.bone, ow: 4, maxWidth: w - 150 });
    text(ctx, sid ? D.stageLabel(sid) : '', x + w - 20, cy, { size: 12, align: 'right', weight: 700, color: PAL.dim });
    if (r.boss && d.title) { cy += 18; text(ctx, d.title, x + 20, cy, { size: 12, weight: 700, color: '#d8a070' }); }
    divider(ctx, x + 14, cy + 10, w - 28);
    cy += 32;
    // 능력치 한 줄
    const stats = [['Lv', d.lv ?? D.STAGES()[sid]?.level ?? 1], ['HP', d.hp], ['공격', d.atk], ['방어', d.def ?? 0], ['EXP', d.exp]];
    let sx = x + 20;
    for (const [k, v] of stats) {
      if (v === undefined) continue;
      text(ctx, k, sx, cy, { size: 11, weight: 800, family: FONT.num, color: PAL.dim });
      const kw = measure(ctx, k, 11, 800, FONT.num);
      text(ctx, String(v), sx + kw + 5, cy, { size: 14, weight: 800, family: FONT.num, color: PAL.bone });
      sx += kw + measure(ctx, String(v), 14, 800, FONT.num) + 20;
    }
    if (d.material && MAT_NAME[d.material]) text(ctx, `재질 · ${MAT_NAME[d.material]}`, x + w - 20, cy, { size: 11, align: 'right', weight: 700, color: PAL.dim });
    cy += 24;
    // 약점 / 내성
    const chips = (label, list, good) => {
      text(ctx, label, x + 20, cy + 13, { size: 12, weight: 800, color: good ? '#ff9a8a' : '#9ac8ff' });
      let cx = x + 60;
      if (!list?.length) { text(ctx, '없음', cx, cy + 13, { size: 12, color: PAL.faint }); return; }
      for (const el of list) {
        const e = EL[el] || { name: el, color: PAL.bone };
        cx += pill(ctx, e.name, cx, cy, { size: 11, h: 18, color: e.color, bg: rgba('#140a12', 0.9) }) + 5;
      }
    };
    const half = (w - 40) / 2;
    chips('약점', d.weak, true);
    const keep = x; x += half; chips('내성', d.resist, false); x = keep;
    cy += 30;
    // 드롭
    const drops = (d.drops || []).filter((dr) => dr && dr.id);
    if (drops.length || r.boss) {
      text(ctx, '드롭', x + 20, cy + 4, { size: 12, weight: 800, color: '#ffd070' });
      const parts = r.boss ? ['보스 전리품', ...(d.drops || []).map((id) => (typeof id === 'string' ? D.dropName(id) : D.dropName(id.id)))] : drops.map((dr) => `${D.dropName(dr.id)}${dr.p ? ` ${Math.round(dr.p * 100)}%` : ''}`);
      text(ctx, ellipsize(ctx, parts.join(' · '), w - 90, 12, 600), x + 60, cy + 4, { size: 12, weight: 600, color: PAL.text });
      cy += 20;
    }
    divider(ctx, x + 14, cy, w - 28, { center: false, a: 0.35 });
    const maxL = Math.max(1, Math.floor((y + h - 12 - (cy + 20)) / 19));
    para(ctx, d.desc ?? d.intro ?? '', x + 20, cy + 22, w - 40, { size: 13, color: '#d8ccb8', lh: 1.5, max: maxL });
  }
}
