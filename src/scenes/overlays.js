// 인게임 오버레이 장면: 보스 등장, 필살기 컷인, 비전서 열람, 게임오버(컨티뉴), 일시정지
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, panel, paragraph, FONT, COLORS, ListMenu, button, vignette } from '../core/ui.js';
import { BOSSES } from '../data/bosses.js';
import { CHARACTERS } from '../data/characters.js';
import { DOCS, LORE } from '../data/lore.js';
import { clamp, ease, rgba, TAU } from '../core/math.js';
import { saves } from '../core/save.js';

/** 보스 등장: WARNING 경고 → 초상화 + 이름 */
export class BossIntroScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ bossId, onDone }) { this.def = BOSSES[bossId] || { name: bossId }; this.onDone = onDone; this.dur = 3.6; audio.sfx('warning'); }
  update(dt) {
    if (this.t > 1.3 && !this.roared) { this.roared = true; audio.sfx('boss_roar'); this.game.world?.camera.shake(10, 0.6); }
    if (this.t > this.dur || (this.t > 1.5 && (input.pressed('confirm') || input.pointer.tapped))) { this.game.pop(); this.onDone?.(); }
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH, t = this.t;
    if (t < 1.4) {
      const on = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = `rgba(120,0,10,${on ? 0.35 : 0.15})`; ctx.fillRect(0, 0, vw, vh);
      for (const y of [vh * 0.38, vh * 0.62]) {
        ctx.fillStyle = 'rgba(180,0,20,0.85)'; ctx.fillRect(0, y - 14, vw, 28);
        ctx.save(); ctx.beginPath(); ctx.rect(0, y - 14, vw, 28); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const off = (t * 300) % 60;
        for (let x = -60; x < vw + 60; x += 60) { ctx.beginPath(); ctx.moveTo(x + off, y - 14); ctx.lineTo(x + off + 30, y - 14); ctx.lineTo(x + off + 10, y + 14); ctx.lineTo(x + off - 20, y + 14); ctx.fill(); }
        ctx.restore();
      }
      if (on) text(ctx, 'WARNING', vw / 2, vh / 2 + 22, { size: 64, align: 'center', weight: 900, family: FONT.logo, color: '#ff2a3a', ow: 6 });
      return;
    }
    const k = ease.outCubic(clamp((t - 1.4) / 0.5, 0, 1));
    const out = clamp((this.dur - t) / 0.4, 0, 1);
    ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, vw, vh);
    const img = assets.get(this.def.portrait);
    if (img) {
      const h = vh * 0.95, w = h * img.width / img.height;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(vw * 0.35 + 80, 0); ctx.lineTo(vw, 0); ctx.lineTo(vw, vh); ctx.lineTo(vw * 0.35, vh); ctx.clip();
      ctx.drawImage(img, vw - w * k - 20 + (1 - k) * 200, vh - h, w, h);
      ctx.restore();
      ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vw * 0.35 + 80, 0); ctx.lineTo(vw * 0.35, vh); ctx.stroke();
    }
    const x = 60 - (1 - k) * 300;
    text(ctx, this.def.title ?? '', x, vh * 0.42, { size: 18, weight: 600, color: '#e8c8a8' });
    text(ctx, this.def.name, x, vh * 0.42 + 56, { size: 52, weight: 800, family: FONT.title, color: '#ff4a5a', ow: 6 });
    ctx.fillStyle = '#e8c872'; ctx.fillRect(x, vh * 0.42 + 72, 320 * k, 3);
    ctx.globalAlpha = 1;
  }
}

/** 필살기 컷인 */
export class UltCutinScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ charId }) { this.ch = CHARACTERS[charId]; this.dur = 1.1; }
  update() { if (this.t > this.dur) this.game.pop(); }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH, t = this.t;
    const k = ease.outExpo(clamp(t / 0.25, 0, 1));
    const out = clamp((this.dur - t) / 0.2, 0, 1);
    ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, vw, vh);
    const y0 = vh * 0.28, h = vh * 0.44;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, y0 + 30); ctx.lineTo(vw, y0); ctx.lineTo(vw, y0 + h - 30); ctx.lineTo(0, y0 + h); ctx.closePath();
    ctx.fillStyle = rgba(this.ch.ult?.color ?? '#fff', 0.25); ctx.fill();
    ctx.clip();
    const img = assets.get(this.ch.portrait);
    if (img) { const w = vw * 0.6, ih = w * img.height / img.width; ctx.drawImage(img, vw * 0.4 - (1 - k) * vw + t * 40, y0 - ih * 0.18, w, ih); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(((i * 97 + t * 2400) % (vw + 200)) - 100, y0 + (i * 37) % h, 160, 2); }
    ctx.restore();
    text(ctx, this.ch.ult?.name ?? '필살기', vw * 0.08 + (1 - k) * -300, y0 + h / 2 + 18, { size: 50, weight: 900, family: FONT.title, color: this.ch.ult?.color ?? '#fff', ow: 7 });
    ctx.globalAlpha = 1;
  }
}

/** 비전서/기록물 열람 */
export class DocumentScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ docId, loreId }) {
    this.doc = docId ? DOCS[docId] : LORE[loreId];
    this.isDoc = !!docId;
    if (this.game.world) this.game.world.cutscene = true;
  }
  exit() { if (this.game.world) this.game.world.cutscene = false; }
  update() { if (this.t > 0.6 && (input.pressed('confirm') || input.pressed('cancel') || input.pressed('attack') || input.pointer.tapped)) { audio.sfx('menu_cancel'); this.game.pop(); } }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, vw, vh);
    const w = Math.min(640, vw - 80), h = 400, x = (vw - w) / 2, y = (vh - h) / 2;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#e8dcb8'); g.addColorStop(1, '#c8b890');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    vignetteRect(ctx, x, y, w, h);
    const d = this.doc || { name: '???', text: '글씨가 번져 읽을 수 없다.' };
    text(ctx, this.isDoc ? '— 비 전 서 —' : '— 기 록 —', vw / 2, y + 44, { size: 14, align: 'center', color: '#6a3a1a', outline: null, family: FONT.title, weight: 700 });
    text(ctx, d.name, vw / 2, y + 80, { size: 26, align: 'center', color: '#3a1a0a', outline: null, family: FONT.title, weight: 800 });
    ctx.fillStyle = '#8a2a1a'; ctx.fillRect(vw / 2 - 80, y + 92, 160, 2);
    paragraph(ctx, d.text ?? '', x + 40, y + 130, w - 80, { size: 16, color: '#2a1a0a', family: FONT.title, lineH: 1.6, maxLines: 8 });
    if (d.tech) {
      panel(ctx, x + 40, y + h - 84, w - 80, 56, { fill: 'rgba(60,10,10,0.85)' });
      text(ctx, `습득 기술: ${d.tech.name}`, x + 60, y + h - 58, { size: 16, weight: 800, color: '#ffe7a0' });
      text(ctx, `커맨드: ${cmdToText(d.tech.cmd)}   ${d.tech.desc ?? ''}`, x + 60, y + h - 36, { size: 13, color: '#e8d8c0' });
    } else if (d.stats) {
      text(ctx, '영구 능력치 상승 효과를 얻었다', vw / 2, y + h - 40, { size: 15, align: 'center', weight: 800, color: '#8a1a0a', outline: null });
    }
  }
}
function vignetteRect(ctx, x, y, w, h) {
  const g = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, w * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,30,0,0.45)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
}
export function cmdToText(cmd = []) {
  const m = { u: '↑', d: '↓', f: '→', b: '←', df: '↘', db: '↙', uf: '↗', ub: '↖', 'btn:attack': '공격', 'btn:jump': '점프', 'btn:skill1': '스킬1', 'btn:skill2': '스킬2', 'btn:dash': '대시', 'btn:sub': '보조' };
  return cmd.map((c) => m[c] ?? c).join(' ');
}

/** 게임오버 → 아케이드식 CONTINUE 카운트다운 */
export class GameOverScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ world }) {
    this.world = world; this.count = 9.99; this.menu = new ListMenu(2);
    this.canContinue = world.run.continues > 0;
    audio.music('gameover');
  }
  update(dt) {
    if (this.done) return;
    if (!this.canContinue) {
      if (this.t > 2 && (input.anyPressed())) this.giveUp();
      return;
    }
    this.count -= dt * (input.pressed('attack') ? 0 : 1);
    if (input.pressed('attack')) this.count -= 1; // 연타로 카운트 빨리 넘기기 (아케이드)
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') { if (this.menu.index === 0) this.cont(); else this.giveUp(); }
    if (this.count <= 0) this.giveUp();
  }
  cont() {
    this.done = true;
    audio.sfx('coin_insert');
    const w = this.world;
    w.run.continues--;
    w.run.score = 0; // 아케이드 규칙: 컨티뉴 시 점수 초기화
    this.game.pop();
    w.respawn(true);
    audio.music(w.bossActive ? (w.boss?.def?.music ?? 'boss') : (w.room.music ?? w.stage.music));
  }
  giveUp() {
    this.done = true;
    const w = this.world;
    const st = this.game.state;
    st.lives = w.diff.lives;
    // 기록 등록
    this.game.recordScore?.(w.run.score, w.stage.id);
    saves.write(st.slot, st);
    this.game.go(this.game.registry.hub ? 'hub' : 'title', {});
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    ctx.fillStyle = `rgba(20,0,4,${Math.min(0.8, this.t)})`; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.8, '60,0,0');
    text(ctx, 'GAME OVER', vw / 2, vh * 0.3, { size: 58, align: 'center', weight: 900, family: FONT.logo, color: '#c0102a', ow: 6 });
    if (this.canContinue) {
      text(ctx, 'CONTINUE?', vw / 2, vh * 0.45, { size: 30, align: 'center', weight: 800, family: FONT.logo, color: '#ffe7a0' });
      text(ctx, String(Math.max(0, Math.ceil(this.count) - 1)), vw / 2, vh * 0.6, { size: 90, align: 'center', weight: 900, family: FONT.num, color: '#fff', ow: 6 });
      text(ctx, `남은 크레딧: ${this.world.run.continues}   (컨티뉴 시 점수 초기화)`, vw / 2, vh * 0.67, { size: 14, align: 'center', color: COLORS.dim });
      const w = 220, h = 44;
      ['이어하기', '포기 (마을로)'].forEach((l, k) => {
        const r = { x: vw / 2 - w - 10 + k * (w + 20), y: vh * 0.74, w, h };
        this.menu.hit(k, r);
        button(ctx, r, l, { selected: this.menu.index === k });
      });
    } else {
      text(ctx, '크레딧이 모두 소진되었다… 마을로 돌아갑니다', vw / 2, vh * 0.5, { size: 18, align: 'center', color: '#e8d8c0' });
    }
  }
}
