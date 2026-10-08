// 시련 실패 화면 (TrialEndScene) — owner: TRIALS-ENGINE (docs/specs/classes_t3.md §9.4, story_ext.md §2 failLine)
//  game/trial.js failTrial 이 쓰러진 시련 월드 위에 민다: push('trialEnd', { world, tid })
//  - 게임오버 화면(overlays.js GameOverScene)을 본뜬 오버레이: opaque=false · uiScale · hidePad · deferToasts
//  - 단추 두 개: 「다시 도전」(TRIAL.retryTrial — 새 월드로 보스방) / 「성당으로」(TRIAL.leaveTrial — 마을 성당 전직 탭)
//    ←→ + 결정, 터치는 첫 탭에 고르고 다시 탭하면 결정, 마우스는 움직였을 때만 가리킨 단추를 고른다
//  - 엘리제의 한마디(T.failLine) + 보스 남은 체력·전투 시간 (얼마나 다가갔는지 한눈에)
//  - 막 뜬 화면(ARM 초)은 입력을 받지 않는다 (쓰러지며 연타하던 공격·점프가 곧바로 결정으로 번지지 않게)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, wrap, FONT, COLORS, ListMenu, button, bloodText, prewarmText, taps } from '../core/ui.js';
import { drawHints, promptMode } from '../core/prompts.js';
import { clamp, ease, fmtTime, TAU } from '../core/math.js';
import { faceRect } from '../render/portrait.js';
import { hudSafe } from '../render/hud_layout.js';
import { TRIALS } from '../data/trials.js';
import * as TRIAL from '../game/trial.js';

const ARM = 0.6;
const TITLE = '시련 실패';
const ELISE = 'portraits/npc_elise';
const PURPLE = TRIAL.TRIAL_COLOR;
const BTN = ['다시 도전', '성당으로'];
const TAP_ID = ['te_retry', 'te_leave'];

/** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale: uiK 포함) */
function cssPer(sc) { const g = sc.game; return Math.max(0.2, (g.cssScale || 1) * (g.uiK || 1)); }
/** 주 단추 높이: 44 CSS px (+2) 이상 */
function tapH(sc, base = 44) { return Math.max(base, Math.ceil(46 / cssPer(sc))); }
function safeOf(sc) { const S = hudSafe(sc.game), k = sc.game.uiK || 1; return { t: (S.t || 0) / k, b: (S.b || 0) / k }; }

export class TrialEndScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; this.deferToasts = true; }
  enter({ world = null, tid = null } = {}) {
    this.world = world ?? this.game.world;
    this.tid = tid ?? this.world?.trial?.id ?? null;
    this.T = this.tid && Object.hasOwn(TRIALS, this.tid) ? TRIALS[this.tid] : null;
    this.menu = new ListMenu(2, { cols: 2 });
    this.done = false; this.px = undefined; this.py = undefined;
    this.vg = null; this.vgKey = '';
    const w = this.world, b = w?.boss;
    this.bossPct = b?.stats?.maxHp > 0 && !b.pendingBoss ? clamp(Math.ceil((b.hp / b.stats.maxHp) * 100), 0, 100) : null;
    this.fightT = Math.max(0, (w?.run?.time ?? 0) - (w?.trialFightT0 ?? w?.run?.time ?? 0));
    this.tries = this.tid ? (w?.hero?.trials?.[this.tid]?.tries ?? 0) : 0;
    try { assets.preload([ELISE]); } catch { /* 없음 */ }
    audio.stopMusic?.(0.8);
    audio.sfx('bell', { vol: 0.45 });
    this.prewarm();
  }
  prewarm() {
    const g = this.game, ctx = g.ctx;
    if (!ctx?.setTransform) return;
    ctx.save();
    try { const s = (g.scale || 1) * (g.uiK || 1); ctx.setTransform(s, 0, 0, s, 0, 0); prewarmText(ctx, TITLE, { size: this.titleSize(g.uiH || g.viewH) }); } catch { /* 그릴 때 굽는다 */ } finally { ctx.restore(); }
  }
  titleSize(H) { return H < 440 ? 44 : 54; }
  update(dt) {
    if (this.done) return;
    const armed = this.t >= ARM;
    const p = input.pointer;
    if (!armed || this.px === undefined) { this.px = p.x; this.py = p.y; }
    if (!armed) return;
    if (p.active && (p.x !== this.px || p.y !== this.py)) {
      this.px = p.x; this.py = p.y;
      const o = taps.over(this), k = TAP_ID.indexOf(o);
      if (k >= 0) this.menu.index = k;
    }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    const hit = TAP_ID.indexOf(taps.hit(this));
    if (hit >= 0) {
      if (input.touchMode && this.menu.index !== hit) { this.menu.index = hit; audio.sfx('menu_move'); }
      else { this.menu.index = hit; this.choose(); }
      return;
    }
    if (r === 'confirm') this.choose();
  }
  choose() {
    if (this.done) return;
    this.done = true;
    audio.sfx('menu_ok');
    const g = this.game, tid = this.tid;
    if (this.menu.index === 0) TRIAL.retryTrial(g, tid);
    else TRIAL.leaveTrial(g, tid, 'leave');
  }
  vignette(ctx, W, H) {
    const key = `${W}|${H}`;
    if (this.vgKey !== key) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      gr.addColorStop(0, 'rgba(30,6,48,0)'); gr.addColorStop(1, 'rgba(30,6,48,0.85)');
      this.vg = gr; this.vgKey = key;
    }
    ctx.fillStyle = this.vg; ctx.fillRect(0, 0, W, H);
  }
  render(ctx) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, S = safeOf(this), t = this.t;
    if (g.scenes[0] === this) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = `rgba(10,4,18,${Math.min(0.78, t * 1.4)})`; ctx.fillRect(0, 0, W, H);
    this.vignette(ctx, W, H);
    const T = this.T;
    const f = clamp((H - 40) / 480, 0.74, 1);
    const ts = this.titleSize(H), bh = tapH(this);
    // 엘리제 카드: 줄 수에 따라 높이
    const cw = Math.min(600, W - 60), tx = 86, tw = cw - tx - 22;
    const line = T?.failLine ?? '';
    const lines = line ? wrap(ctx, `「${line}」`, tw, 17, 600, FONT.body) : [];
    const lh = 24, cardH = Math.max(80, 44 + lines.length * lh);
    const gap1 = 30 * f, gap2 = 22 * f, gap3 = 26 * f, gap4 = 20 * f;
    const total = ts * 0.75 + gap1 + 18 + gap2 + cardH + gap3 + 16 + gap4 + bh;
    const avail = H - S.b - 30 - S.t - 10;
    let y = S.t + 10 + Math.max(0, (avail - total) * 0.45) + ts * 0.75;
    // 제목 (흔들리며 떠오른다)
    const kIn = ease.outCubic(clamp(t / 0.35, 0, 1));
    ctx.save(); ctx.globalAlpha = kIn;
    bloodText(ctx, TITLE, W / 2, y, { size: ts, t });
    ctx.restore();
    y += gap1 + 6;
    if (T) text(ctx, T.name, W / 2, y, { size: 17, align: 'center', weight: 800, family: FONT.title, color: PURPLE, ow: 3, maxWidth: W - 60 });
    y += gap2;
    // 엘리제의 한마디
    const cx = (W - cw) / 2, cy = y;
    ctx.save();
    ctx.globalAlpha = clamp((t - 0.15) / 0.3, 0, 1);
    ctx.fillStyle = 'rgba(16,8,26,0.88)'; ctx.fillRect(cx, cy, cw, cardH);
    ctx.strokeStyle = 'rgba(200,160,255,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, cardH - 1);
    const pr = 30, pcx = cx + 16 + pr, pcy = cy + cardH / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, TAU); ctx.fillStyle = '#140a1c'; ctx.fill(); ctx.clip();
    const img = assets.get(ELISE);
    const fr = img ? faceRect(img, ELISE, 1.5) : null;
    if (fr) ctx.drawImage(img, fr.sx, fr.sy, fr.sw, fr.sh, pcx - pr, pcy - pr, pr * 2, pr * 2);
    ctx.restore();
    ctx.strokeStyle = PURPLE; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pcx, pcy, pr + 1, 0, TAU); ctx.stroke();
    text(ctx, '엘리제', cx + tx, cy + 26, { size: 14, weight: 800, color: '#f0d8ff', ow: 2 });
    lines.forEach((l, k) => text(ctx, l, cx + tx, cy + 50 + k * lh, { size: 17, weight: 600, color: COLORS.bone, ow: 3 }));
    ctx.restore();
    y = cy + cardH + gap3 + 4;
    // 얼마나 다가갔나
    const info = [];
    if (this.bossPct != null) info.push(`보스 체력 ${this.bossPct}% 남음`);
    if (this.fightT > 0) info.push(`전투 ${fmtTime(this.fightT)}`);
    if (this.tries > 0) info.push(`도전 ${this.tries}회`);
    if (info.length) text(ctx, info.join('  ·  '), W / 2, y, { size: 14, align: 'center', weight: 700, color: COLORS.dim, ow: 2 });
    y += gap4;
    // 단추
    const bw = Math.min(220, (W - 80) / 2);
    ctx.save();
    ctx.globalAlpha = clamp(t / ARM, 0.3, 1);
    const ptr = input.pointer, act = ptr.active;
    ptr.active = false;   // 강조는 실제 선택(menu.index)만 — 가만히 있는 커서 밑 단추까지 강조되지 않게 (GameOverScene 과 같다)
    try {
      BTN.forEach((label, k) => {
        const r = { x: W / 2 - bw - 10 + k * (bw + 20), y, w: bw, h: bh };
        button(ctx, r, label, { selected: this.menu.index === k });
        taps.add(TAP_ID[k], r, { owner: this, kind: 'primary', src: 'trialEnd' });
      });
    } finally { ptr.active = act; }
    const hy = Math.max(y + bh + 24, H - 14 - S.b);
    if (promptMode() === 'touch') text(ctx, '버튼을 눌러 고르세요', W / 2, hy, { size: 13, align: 'center', color: COLORS.dim, ow: 2 });
    else drawHints(ctx, [['dpadH', '선택'], ['confirm', '결정']], W / 2, hy, { align: 'center', size: 13, color: COLORS.dim });
    ctx.restore();
  }
}
