// 스테이지 클리어 결과 (아케이드식 보너스 정산 + 랭크) — owner: PLAT-DIALOG
//  - uiScale 장면 (platform §6.2): game.uiW × game.uiH 로 배치, 최소 720×400 에서 넘치지 않는다
//  - 'STAGE CLEAR' 와 랭크 글자는 피 글씨(bloodText, 글꼴 후속 작업)
//  - 계속: 결정(Z·Enter / 패드 A) · 공격 · START · 화면 아무 곳 터치 (안내는 prompts 글리프)
//  - leave(): 아웃트로(처음 클리어 때만) → 엔딩(s12·s13·s20, world2 §2.3) 또는 마을
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, panel, FONT, COLORS, drawCover, vignette, bloodText, prewarmText } from '../core/ui.js';
import { drawHints } from '../core/prompts.js';
import { fmt, fmtTime, clamp, ease } from '../core/math.js';
import { saves } from '../core/save.js';
import { SCRIPTS } from '../data/story.js';
import { bus } from '../core/events.js';

const RANKS = [
  { r: 'S', c: '#ffe070', min: 90, style: 'gold' }, { r: 'A', c: '#ffa640', min: 75, style: 'blood' }, { r: 'B', c: '#5aa8ff', min: 55, style: 'bone' },
  { r: 'C', c: '#7ee07e', min: 35, style: 'bone' }, { r: 'D', c: '#a0a0a0', min: 0, style: 'bone' },
];
/** 클리어하면 엔딩 장면으로 가는 스테이지 (엔딩 장면이 data/story.js endingAfter() 로 최종 판정; world2 §2.3) */
export const ENDING_STAGES = ['s12', 's13', 's20'];
const RANK_W = 170, GAP = 20; // 오른쪽 랭크 도장 칸 폭, 표와의 간격 (UI px)

/** 이미 본 아웃트로라도, 지금 조건이 참인 분기 뒤에 아직 켜지지 않은 플래그가 있으면(예: s12 유물 5개 → 심연의 문) 다시 재생 */
function hasNewBranch(script, st) {
  const lines = SCRIPTS[script];
  const f = st?.progress?.flags ?? {};
  if (!lines) return false;
  const holds = (c) => (typeof c === 'string' ? (c.startsWith('!') ? !f[c.slice(1)] : !!f[c]) : c?.char ? st?.charId === c.char : true);
  for (const l of lines) {
    if (!(l.if && l.cmd === 'goto' && holds(l.if))) continue;
    const at = lines.findIndex((q) => q.label === l.label && !q.cmd);
    if (at >= 0 && lines.slice(at + 1).some((q) => q.cmd === 'flag' && f[q.key] !== (q.value ?? true))) return true;
  }
  return false;
}

export class ResultsScene extends Scene {
  constructor(g) {
    super(g);
    this.deferToasts = true; // 퀘스트 완료 토스트가 표를 가리지 않도록 결과 화면을 나간 뒤 표시
    this.uiScale = true;
    this.hidePad = true;
  }
  enter({ world }) {
    this.world = world;
    const run = world.run, st = this.game.state, stage = world.stage;
    const par = stage.parTime ?? 240;
    const timeBonus = Math.max(0, Math.round((par * 1.5 - run.time) * 100));
    const comboBonus = world.combo.best * 200;
    const noDamage = run.damageTaken === 0 ? 50000 : 0;
    const secretBonus = run.secrets * 3000;
    const lifeBonus = run.lives * 5000;
    this.rows = [
      ['클리어 시간', fmtTime(run.time), timeBonus],
      ['최대 콤보', `${world.combo.best} HITS`, comboBonus],
      ['처치 수', `${run.kills}`, run.kills * 50],
      ['비밀 발견', `${run.secrets}`, secretBonus],
      ['남은 목숨', `${run.lives}`, lifeBonus],
      ['무피해 보너스', run.damageTaken === 0 ? 'PERFECT!' : '-', noDamage],
    ];
    const total = this.rows.reduce((a, r) => a + r[2], 0);
    this.baseScore = run.score;
    this.finalScore = run.score + Math.round(total * (world.diff.scoreMult ?? 1));
    // 랭크 점수
    let pts = 40;
    pts += clamp((par - run.time) / par, -0.5, 0.6) * 40;
    pts += clamp(world.combo.best / 60, 0, 1) * 20;
    pts += run.damageTaken === 0 ? 20 : clamp(1 - run.damageTaken / (world.player.stats.hp * 3), 0, 1) * 12;
    pts += Math.min(10, run.secrets * 4);
    this.rank = RANKS.find((r) => pts >= r.min) || RANKS[RANKS.length - 1];
    this.goldReward = Math.round((200 + stage.level * 60) * ({ S: 2, A: 1.5, B: 1.2, C: 1, D: 0.8 }[this.rank.r]) * (world.diff.gold ?? 1));
    // 진행 반영
    st.gold += this.goldReward;
    st.score = this.finalScore;
    // 옛 세이브의 기록이 객체가 아니거나(true 등) 랭크가 없으면 새 기록을 그대로 쓴다 (rank: undefined 로 덮지 않게)
    const prev = st.progress.cleared[stage.id] && typeof st.progress.cleared[stage.id] === 'object' ? st.progress.cleared[stage.id] : null;
    const prevRank = typeof prev?.rank === 'string' && 'SABCD'.includes(prev.rank) && prev.rank.length === 1 ? prev.rank : null;
    const better = !prevRank || 'SABCD'.indexOf(this.rank.r) < 'SABCD'.indexOf(prevRank);
    st.progress.cleared[stage.id] = { rank: better ? this.rank.r : prevRank, time: Math.min(Number.isFinite(prev?.time) ? prev.time : 1e9, run.time), score: Math.max(Number.isFinite(prev?.score) ? prev.score : 0, this.finalScore) };
    if (stage.next && !st.progress.unlocked.includes(stage.next)) st.progress.unlocked.push(stage.next);
    for (const u of stage.unlocks || []) if (!st.progress.unlocked.includes(u)) st.progress.unlocked.push(u);
    st.progress.chapter = Math.max(st.progress.chapter ?? 0, stage.chapter ?? 0);
    st.lives = Math.max(run.lives, world.diff.lives);
    this.game.recordScore?.(this.finalScore, stage.id);
    bus.emit('stageCleared', { stageId: stage.id, rank: this.rank.r, time: run.time, score: this.finalScore });
    saves.write(st.slot, st);
    this.shownRows = 0; this.rowT = 0; this.scoreShown = this.baseScore;
    this.rankShown = 0; this.left = false;
    this.prewarm();
  }
  /** 피 글씨 비트맵을 미리 굽는다 (첫 프레임·랭크 등장 프레임이 끊기지 않게). 실패해도 그릴 때 굽는다 */
  prewarm() {
    const g = this.game, ctx = g.ctx;
    if (!ctx?.setTransform) return;
    const L = this.layout();
    const k = (g.scale || 1) * (g.uiK || 1);
    ctx.save();
    try {
      ctx.setTransform(k, 0, 0, k, 0, 0);
      prewarmText(ctx, 'STAGE CLEAR', { size: L.titleSize, style: 'gold' });
      prewarmText(ctx, this.rank.r, { size: L.rankSize, style: this.rank.style, drips: 0.6 });
    } catch (e) { /* 글꼴·캔버스 준비 전: 그릴 때 굽는다 */ } finally { ctx.restore(); }
  }
  update(dt) {
    this.rowT += dt;
    if (this.shownRows < this.rows.length && this.rowT > 0.35) { this.rowT = 0; this.shownRows++; audio.sfx('coin'); }
    if (this.shownRows >= this.rows.length) {
      this.scoreShown = Math.min(this.finalScore, this.scoreShown + Math.max(1, (this.finalScore - this.baseScore) * dt * 1.5));
      if (!this.rankShown && this.scoreShown >= this.finalScore) { this.rankShown = this.t; audio.sfx('levelup'); }
    }
    const skip = input.pressed('confirm') || input.pressed('attack') || input.pressed('menu') || input.pointer.tapped;
    if (skip) {
      if (!this.rankShown) { this.shownRows = this.rows.length; this.scoreShown = this.finalScore; this.rankShown = this.t; }
      else if (this.t - this.rankShown > 0.5) this.leave();
    }
  }
  leave() {
    if (this.left) return;
    this.left = true;
    const stage = this.world.stage;
    const next = this.game.registry.hub ? 'hub' : 'title';
    const toEnding = ENDING_STAGES.includes(stage.id) && !!this.game.registry.ending; // 엔딩 장면이 endingAfter()로 최종 판정
    // 아웃트로는 처음 클리어했을 때만 (재클리어 시 리아 합류·엘리제 납치 장면이 반복되지 않도록)
    const st = this.game.state;
    const seen = st?.progress?.seenScripts?.includes(stage.outro);
    const playOutro = stage.outro && SCRIPTS[stage.outro] && this.game.registry.story && (!seen || hasNewBranch(stage.outro, st));
    if (playOutro) this.game.go('story', { script: stage.outro, then: toEnding ? 'ending' : next, thenParams: { from: stage.id }, bg: stage.bg });
    else if (toEnding) this.game.go('ending', { from: stage.id });
    else this.game.go(next, { from: stage.id });
  }

  /** 배치 (UI px). 최소 720×400 에서도 표·랭크·안내가 겹치지 않는다 */
  layout() {
    const g = this.game;
    const W = this.uiScale ? g.uiW || g.viewW : g.viewW, H = this.uiScale ? g.uiH || g.viewH : g.viewH;
    const small = H < 470;
    const titleSize = small ? 44 : 50, titleY = small ? 54 : 70;
    const subY = titleY + (small ? 28 : 32);
    const w = clamp(W - 48 - RANK_W - GAP, 400, 560);
    const x = Math.round((W - (w + GAP + RANK_W)) / 2);
    const y = subY + 20;
    const ph = clamp(H - y - 64, 220, 300);
    return {
      W, H, titleSize, titleY, subY, x, y, w, ph,
      rowY0: y + 38, rowStep: (ph - 84) / 6, scoreY: y + ph - 20,
      rankX: x + w + GAP + RANK_W / 2, rankY: y + ph / 2 + 20, rankSize: small ? 100 : 116,
      rewardY: y + ph + 30, hintY: H - 16, midX: x + (w + GAP + RANK_W) / 2,
    };
  }
  render(ctx) {
    const L = this.layout(), { W, H, x, y, w, ph } = L;
    const stage = this.world.stage;
    drawCover(ctx, stage.bg ? assets.get(stage.bg) : null, W, H, { alpha: 1 }); // 배경 없는 스테이지(시험용 등)는 그라데이션
    ctx.fillStyle = 'rgba(6,2,8,0.72)'; ctx.fillRect(0, 0, W, H);
    vignette(ctx, W, H, 0.7);
    bloodText(ctx, 'STAGE CLEAR', W / 2, L.titleY, { size: L.titleSize, style: 'gold', t: this.t, maxWidth: W - 40 });
    text(ctx, `${stage.name ?? ''}${stage.sub ? ' — ' + stage.sub : ''}`, W / 2, L.subY, { size: 17, align: 'center', family: FONT.title, weight: 700, color: '#e8d8c0', maxWidth: W - 40 });
    panel(ctx, x, y, w, ph);
    const valX = x + Math.round(w * 0.5), rowSize = L.rowStep < 32 ? 16 : 17;
    this.rows.slice(0, this.shownRows).forEach((r, i) => {
      const yy = Math.round(L.rowY0 + i * L.rowStep);
      text(ctx, r[0], x + 30, yy, { size: rowSize, color: '#e8dcc8' });
      text(ctx, r[1], valX, yy, { size: rowSize, align: 'right', weight: 700, color: '#fff' });
      text(ctx, r[2] ? `+${fmt(r[2])}` : '0', x + w - 30, yy, { size: rowSize, align: 'right', weight: 800, family: FONT.num, color: r[2] ? '#ffe070' : '#777' });
    });
    text(ctx, 'SCORE', x + 30, L.scoreY, { size: 18, weight: 800, family: FONT.num, color: COLORS.dim });
    text(ctx, fmt(this.scoreShown), x + w - 30, L.scoreY + 2, { size: 28, align: 'right', weight: 900, family: FONT.num, color: '#fff' });
    if (this.rankShown) {
      const rt = this.t - this.rankShown;
      const k = ease.outBack(clamp(rt / 0.4, 0, 1));
      ctx.save();
      ctx.translate(L.rankX, L.rankY);
      // 랭크 색 후광 (피 글씨 스타일은 금·피·뼈 셋뿐이라 랭크 색은 뒤의 빛으로 보인다)
      if (this._glowSize !== L.rankSize) { // 원점 기준 그라데이션이라 크기가 같으면 다시 만들 필요가 없다
        const gl = ctx.createRadialGradient(0, -L.rankSize * 0.3, 4, 0, -L.rankSize * 0.3, L.rankSize * 0.85);
        gl.addColorStop(0, this.rank.c + '88'); gl.addColorStop(1, this.rank.c + '00');
        this._glow = gl; this._glowSize = L.rankSize;
      }
      ctx.globalAlpha = clamp(rt / 0.3, 0, 1);
      ctx.fillStyle = this._glow; ctx.fillRect(-L.rankSize, -L.rankSize * 1.2, L.rankSize * 2, L.rankSize * 1.8);
      ctx.globalAlpha = 1;
      text(ctx, 'RANK', 0, -L.rankSize * 0.72, { size: 18, align: 'center', weight: 800, family: FONT.num, color: '#e8d8c0' });
      ctx.scale(Math.max(0.01, k), Math.max(0.01, k)); ctx.rotate(-0.15);
      bloodText(ctx, this.rank.r, 0, L.rankSize * 0.26, { size: L.rankSize, style: this.rank.style, drips: 0.6, t: rt });
      ctx.restore();
      text(ctx, `보상 ${fmt(this.goldReward)} G`, L.midX, Math.min(L.rewardY, L.hintY - 24), { size: 18, align: 'center', weight: 800, color: '#ffd84a' });
      if (Math.floor(this.t * 2) % 2 === 0) {
        if (input.touchMode) text(ctx, '화면을 터치하세요', W / 2, L.hintY, { size: 15, align: 'center', color: COLORS.dim });
        else drawHints(ctx, [['confirm', '계속']], W / 2, L.hintY, { align: 'center', size: 15, color: COLORS.dim });
      }
    }
  }
}
