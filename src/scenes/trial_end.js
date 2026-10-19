// 시련 실패 화면 (TrialEndScene) — owner: TRIALS-ENGINE (docs/specs/classes_t3.md §9.4, story_ext.md §2 failLine)
//  game/trial.js failTrial 이 쓰러진 시련 월드 위에 민다: push('trialEnd', { world, tid })
//  - 게임오버 화면(overlays.js GameOverScene)을 본뜬 오버레이: opaque=false · uiScale · hidePad · deferToasts
//  - 단추 두 개: 「다시 도전」(TRIAL.retryTrial — 새 월드로 보스방) / 「성당으로」(TRIAL.leaveTrial — 마을 성당 전직 탭)
//    ←→ + 결정, 터치·클릭은 한 번에 결정 ([ux-fix #9] 예전에는 터치 첫 탭이 고르기뿐이라 두 번 눌러야 했다), 마우스는 움직였을 때만 가리킨 단추를 고른다
//  - 엘리제의 한마디(T.failLine) + 보스 남은 체력·전투 시간 (얼마나 다가갔는지 한눈에)
//  - 막 뜬 화면(ARM 초)은 입력을 받지 않는다 (쓰러지며 연타하던 공격·점프가 곧바로 결정으로 번지지 않게)
//    탭은 화면이 뜨고 ARM 초가 지난 뒤에 눌린 손가락만 받는다 — 쓰러질 때 이미 화면을 누르고 있던 손가락을 떼어도 결정되지 않는다
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, wrap, FONT, COLORS, ListMenu, button, bloodText, prewarmText, taps, textFloor } from '../core/ui.js';
import { drawHints, promptMode } from '../core/prompts.js';
import { clamp, ease, fmtTime, TAU } from '../core/math.js';
import { faceRect } from '../render/portrait.js';
import { hudSafe } from '../render/hud_layout.js';
import { TRIALS } from '../data/trials.js';
import { RARITIES } from '../data/items.js';
import { NM_COLOR, NM_IDS, NM_MODE } from '../data/nightmare.js';
import * as TRIAL from '../game/trial.js';
import { nmFrom, nmRecordOf, finishNightmare } from '../game/nightmare.js';   // [nightmare] 악몽 실패도 이 화면 (docs/specs/nightmare.md §1)

const ARM = 0.6;
const TITLE = '시련 실패';
const ELISE = 'portraits/npc_elise';
const PURPLE = TRIAL.TRIAL_COLOR;
const BTN = ['다시 도전', '성당으로'];
const NM_TITLE = `${NM_MODE} 실패`;   // [nightmare] 악몽 실패 제목 · 지도에서 들어왔으면 「마을로」
const NM_BTN = ['다시 도전', '마을로'];
const NM_WIN = `${NM_MODE} 성공`;   // [P3b] 악몽 격파 결과 화면 (보상 줄) — completeNightmare 가 push('trialEnd', { result })
const NM_WIN_LINE = '악몽을 이겨 냈어요! 이번엔 제가 종을 크게 칠게요.';
const TAP_ID = ['te_retry', 'te_leave'];

/** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale: uiK 포함) */
function cssPer(sc) { const g = sc.game; return Math.max(0.2, (g.cssScale || 1) * (g.uiK || 1)); }
/** 주 단추 높이: 44 CSS px (+2) 이상 */
function tapH(sc, base = 44) { return Math.max(base, Math.ceil(46 / cssPer(sc))); }
function safeOf(sc) { const S = hudSafe(sc.game), k = sc.game.uiK || 1; return { t: (S.t || 0) / k, b: (S.b || 0) / k }; }

export class TrialEndScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; this.deferToasts = true; }
  enter({ world = null, tid = null, result = null } = {}) {
    this.world = world ?? this.game.world;
    this.tid = tid ?? this.world?.trial?.id ?? null;
    this.T = this.tid && Object.hasOwn(TRIALS, this.tid) ? TRIALS[this.tid] : (TRIAL.trialOf(this.tid) ?? null);   // [nightmare] 'nm_<stage>' → 악몽 행
    // [P3b] 악몽 격파 결과 (completeNightmare 의 w.nmResult) — 있으면 보상 줄 화면, 없으면 예전 실패 화면
    this.result = this.T?.nightmare && result && typeof result === 'object' ? result : null;
    this.menu = new ListMenu(2, { cols: 2 });
    this.menu.index = this.result ? 1 : 0;   // 격파 뒤 기본 = 돌아가기 (다시 도전은 한 칸 옆)
    this.done = false; this.px = undefined; this.py = undefined;
    this.freshPress = false;   // [ux-fix #9] 이 화면이 뜨고 ARM 초 뒤에 눌린 손가락인가 (그 손가락의 탭만 결정한다)
    this.vg = null; this.vgKey = '';
    const w = this.world, b = w?.boss;
    this.bossPct = b?.stats?.maxHp > 0 && !b.pendingBoss ? clamp(Math.ceil((b.hp / b.stats.maxHp) * 100), 0, 100) : null;
    this.fightT = Math.max(0, (w?.run?.time ?? 0) - (w?.trialFightT0 ?? w?.run?.time ?? 0));
    this.tries = this.tid ? (w?.hero?.trials?.[this.tid]?.tries ?? 0) : 0;
    if (this.T?.nightmare) this.tries = nmRecordOf(this.game.state, this.tid)?.tries ?? 0;   // [nightmare] 슬롯 state.nm 기록
    try { assets.preload([ELISE]); } catch { /* 없음 */ }
    if (this.result) {
      audio.sfx('bell', { vol: 0.55, pitch: 0.8 });
      if (this.result.first) audio.sfx('item', { vol: 0.7 });
    } else {
      audio.stopMusic?.(0.8);
      audio.sfx('bell', { vol: 0.45 });
    }
    this.prewarm();
  }
  /** [P3b] 결과 화면의 보상 줄 → [[이름, 값, 색], …] */
  resultRows() {
    const R = this.result;
    if (!R) return [];
    const rows = [];
    if (R.first) {
      const names = Array.isArray(R.items) ? R.items : [];
      names.forEach((n, k) => {
        const rar = RARITIES[clamp(R.rarity?.[k] ?? 4, 0, RARITIES.length - 1)];
        rows.push(['첫 격파 보상', `${n}${rar?.name ? ` (${rar.name})` : ''}`, rar?.color ?? '#ffd860']);
      });
      if (!names.length) rows.push(['첫 격파 보상', '보관함이 가득 찼다', COLORS.dim]);
      rows.push(['골드', `+${(R.gold ?? 0).toLocaleString('ko-KR')} G`, '#ffd84a']);
    } else rows.push(['첫 격파 보상', '이미 받았다', COLORS.dim]);
    const t = Number.isFinite(R.time) ? `${R.time.toFixed(1)}초` : '—';
    rows.push(['기록', R.newBest ? `${t}  · 새 기록!` : `${t}  · 최고 ${Number.isFinite(R.best) ? R.best.toFixed(1) + '초' : '—'}`, R.newBest ? '#ffe070' : COLORS.bone]);
    rows.push([NM_MODE, `${R.clears ?? 0} / ${NM_IDS.length}${R.metaFresh ? '  (+1)' : ''}`, R.metaFresh ? '#ff8a9a' : COLORS.bone]);
    if (Array.isArray(R.trails) && R.trails.length) rows.push(['새 잔상', R.trails.map((s) => `「${s}」`).join(' · '), '#ff8a9a']);
    return rows;
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
    if (p.justDown) this.freshPress = armed;   // [ux-fix #9] 화면이 뜨기 전·직후에 누른 손가락은 떼어도 결정하지 않는다
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
      // [ux-fix #9] 한 번 탭 = 결정 (터치도). 단, 이 화면이 뜬 뒤 새로 누른 손가락이어야 한다
      const ok = this.freshPress;
      this.freshPress = false;
      if (!ok) return;
      this.menu.index = hit; this.choose();
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
    else if (this.result) finishNightmare(g, tid);   // [P3b] 격파 뒤 돌아가기 (도전 횟수를 더 세지 않는다)
    else TRIAL.leaveTrial(g, tid, 'leave');
  }
  vignette(ctx, W, H) {
    const key = `${W}|${H}`;
    if (this.vgKey !== key) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
      const c = this.T?.nightmare ? '52,4,12' : '30,6,48';   // [P3b] 악몽은 검붉은 가장자리
      gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(1, `rgba(${c},0.85)`);
      this.vg = gr; this.vgKey = key;
    }
    ctx.fillStyle = this.vg; ctx.fillRect(0, 0, W, H);
  }
  render(ctx) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH, S = safeOf(this), t = this.t;
    if (g.scenes[0] === this) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = `rgba(10,4,18,${Math.min(0.78, t * 1.4)})`; ctx.fillRect(0, 0, W, H);
    this.vignette(ctx, W, H);
    const T = this.T, R = this.result;
    const f = clamp((H - 40) / 480, 0.74, 1);
    const ts = this.titleSize(H), bh = tapH(this);
    // 엘리제 카드: 줄 수에 따라 높이
    const cw = Math.min(600, W - 60), tx = 86, tw = cw - tx - 22;
    const line = R ? NM_WIN_LINE : T?.failLine ?? '';
    const lines = line ? wrap(ctx, `「${line}」`, tw, 17, 600, FONT.body) : [];
    const lh = 24;
    const gap1 = ts * 0.8 + 8, gap2 = 22 * f, gap3 = 26 * f, gap4 = 20 * f;   // gap1: 피 글씨 방울 아래로 (시련 이름이 방울에 가리지 않게)
    // [P3b] 격파 결과: 엘리제 카드 대신(낮은 화면) 또는 그 아래에 보상 줄 판
    const rows = R ? this.resultRows() : null;
    const RL = Math.max(24, Math.ceil(Math.max(15, textFloor()) * 1.55)), rowsH = rows ? rows.length * RL + 18 : 16;
    const avail = H - S.b - 30 - S.t - 10;
    let cardH = Math.max(80, 44 + lines.length * lh);
    const totalOf = (ch) => ts * 0.75 + gap1 + 18 + gap2 + ch + (ch ? gap3 : 0) + rowsH + gap4 + bh;
    if (R && totalOf(cardH) > avail) cardH = 0;   // 낮은 화면: 보상 줄이 먼저
    const total = totalOf(cardH);
    let y = S.t + 10 + Math.max(0, (avail - total) * 0.45) + ts * 0.75;
    // 제목 (흔들리며 떠오른다)
    const kIn = ease.outCubic(clamp(t / 0.35, 0, 1));
    ctx.save(); ctx.globalAlpha = kIn;
    bloodText(ctx, R ? NM_WIN : T?.nightmare ? NM_TITLE : TITLE, W / 2, y, { size: ts, t });
    ctx.restore();
    y += gap1;
    if (T) text(ctx, T.name, W / 2, y, { size: 17, align: 'center', weight: 800, family: FONT.title, color: T.color ?? PURPLE, ow: 3, maxWidth: W - 60 });
    y += gap2;
    // 엘리제의 한마디
    const cx = (W - cw) / 2, cy = y;
    const rim = T?.nightmare ? NM_COLOR : PURPLE;
    if (cardH > 0) {
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.15) / 0.3, 0, 1);
      ctx.fillStyle = T?.nightmare ? 'rgba(26,6,12,0.9)' : 'rgba(16,8,26,0.88)'; ctx.fillRect(cx, cy, cw, cardH);
      ctx.strokeStyle = T?.nightmare ? 'rgba(255,120,140,0.5)' : 'rgba(200,160,255,0.55)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, cardH - 1);
      const pr = 30, pcx = cx + 16 + pr, pcy = cy + cardH / 2;
      ctx.save();
      ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, TAU); ctx.fillStyle = '#140a1c'; ctx.fill(); ctx.clip();
      const img = assets.get(ELISE);
      const fr = img ? faceRect(img, ELISE, 1.5) : null;
      if (fr) ctx.drawImage(img, fr.sx, fr.sy, fr.sw, fr.sh, pcx - pr, pcy - pr, pr * 2, pr * 2);
      ctx.restore();
      ctx.strokeStyle = rim; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pcx, pcy, pr + 1, 0, TAU); ctx.stroke();
      text(ctx, '엘리제', cx + tx, cy + 26, { size: 14, weight: 800, color: '#f0d8ff', ow: 2 });
      lines.forEach((l, k) => text(ctx, l, cx + tx, cy + 50 + k * lh, { size: 17, weight: 600, color: COLORS.bone, ow: 3 }));
      ctx.restore();
      y = cy + cardH + gap3;
    }
    if (rows) {
      // [P3b] 보상 줄: 첫 격파 보상(장비 · 골드) 또는 「이미 받았다」 · 기록 · 악몽 격파 수 (K1) · 새로 열린 잔상
      const ry = cardH > 0 ? y - gap3 * 0.4 : y;
      ctx.save();
      ctx.globalAlpha = clamp((t - 0.3) / 0.3, 0, 1);
      ctx.fillStyle = 'rgba(20,4,8,0.9)'; ctx.fillRect(cx, ry, cw, rowsH);
      ctx.strokeStyle = 'rgba(224,32,58,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(cx + 0.5, ry + 0.5, cw - 1, rowsH - 1);
      rows.forEach(([k, v, c], i) => {
        const by = ry + 9 + (i + 1) * RL - Math.round(RL * 0.3);
        text(ctx, k, cx + 20, by, { size: 15, weight: 700, color: '#c8a8a8', ow: 2, maxWidth: cw * 0.32 });
        text(ctx, v, cx + cw - 20, by, { size: 16, weight: 800, color: c, ow: 2, align: 'right', maxWidth: cw * 0.62 });
      });
      ctx.restore();
      y = ry + rowsH + gap4 + 4;
    } else {
      y += 4;
      // 얼마나 다가갔나
      const info = [];
      if (this.bossPct != null) info.push(`보스 체력 ${this.bossPct}% 남음`);
      if (this.fightT > 0) info.push(`전투 ${fmtTime(this.fightT)}`);
      if (this.tries > 0) info.push(`도전 ${this.tries}회`);
      if (info.length) text(ctx, info.join('  ·  '), W / 2, y, { size: 14, align: 'center', weight: 700, color: COLORS.dim, ow: 2 });
      y += gap4;
    }
    // 단추
    const bw = Math.min(220, (W - 80) / 2);
    ctx.save();
    ctx.globalAlpha = clamp(t / ARM, 0.3, 1);
    const ptr = input.pointer, act = ptr.active;
    ptr.active = false;   // 강조는 실제 선택(menu.index)만 — 가만히 있는 커서 밑 단추까지 강조되지 않게 (GameOverScene 과 같다)
    try {
      (T?.nightmare && nmFrom() === 'worldmap' ? NM_BTN : BTN).forEach((label, k) => {
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
