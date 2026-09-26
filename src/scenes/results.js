// 스테이지 클리어 결과 (아케이드식 보너스 정산 + 랭크)
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, panel, FONT, COLORS, drawCover, vignette } from '../core/ui.js';
import { fmt, fmtTime, clamp, ease } from '../core/math.js';
import { saves } from '../core/save.js';
import { STAGES } from '../data/stages.js';
import { bus } from '../core/events.js';

const RANKS = [
  { r: 'S', c: '#ffe070', min: 90 }, { r: 'A', c: '#ffa640', min: 75 }, { r: 'B', c: '#5aa8ff', min: 55 },
  { r: 'C', c: '#7ee07e', min: 35 }, { r: 'D', c: '#a0a0a0', min: 0 },
];

export class ResultsScene extends Scene {
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
    const prev = st.progress.cleared[stage.id];
    const better = !prev || 'SABCD'.indexOf(this.rank.r) < 'SABCD'.indexOf(prev.rank);
    st.progress.cleared[stage.id] = { rank: better ? this.rank.r : prev.rank, time: Math.min(prev?.time ?? 1e9, run.time), score: Math.max(prev?.score ?? 0, this.finalScore) };
    if (stage.next && !st.progress.unlocked.includes(stage.next)) st.progress.unlocked.push(stage.next);
    for (const u of stage.unlocks || []) if (!st.progress.unlocked.includes(u)) st.progress.unlocked.push(u);
    st.progress.chapter = Math.max(st.progress.chapter ?? 0, stage.chapter ?? 0);
    st.lives = Math.max(run.lives, world.diff.lives);
    this.game.recordScore?.(this.finalScore, stage.id);
    bus.emit('stageCleared', { stageId: stage.id, rank: this.rank.r, time: run.time, score: this.finalScore });
    saves.write(st.slot, st);
    this.shownRows = 0; this.rowT = 0; this.scoreShown = this.baseScore;
  }
  update(dt) {
    this.rowT += dt;
    if (this.shownRows < this.rows.length && this.rowT > 0.35) { this.rowT = 0; this.shownRows++; audio.sfx('coin'); }
    if (this.shownRows >= this.rows.length) {
      this.scoreShown = Math.min(this.finalScore, this.scoreShown + Math.max(1, (this.finalScore - this.baseScore) * dt * 1.5));
      if (!this.rankShown && this.scoreShown >= this.finalScore) { this.rankShown = this.t; audio.sfx('levelup'); }
    }
    const skip = input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped;
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
    if (stage.outro && this.game.registry.story) this.game.go('story', { script: stage.outro, then: stage.id === 's12' && this.game.registry.ending ? 'ending' : next, thenParams: { from: stage.id }, bg: stage.bg });
    else if (stage.id === 's12' && this.game.registry.ending) this.game.go('ending', {});
    else this.game.go(next, { from: stage.id });
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH;
    drawCover(ctx, assets.get(this.world.stage.bg), vw, vh, { alpha: 1 });
    ctx.fillStyle = 'rgba(6,2,8,0.72)'; ctx.fillRect(0, 0, vw, vh);
    vignette(ctx, vw, vh, 0.7);
    text(ctx, 'STAGE CLEAR', vw / 2, 70, { size: 46, align: 'center', weight: 900, family: FONT.logo, color: '#ffe070', ow: 6 });
    text(ctx, `${this.world.stage.name} — ${this.world.stage.sub ?? ''}`, vw / 2, 102, { size: 17, align: 'center', color: '#e8d8c0' });
    const w = 560, x = vw / 2 - w / 2, y = 130;
    panel(ctx, x, y, w, 300);
    this.rows.slice(0, this.shownRows).forEach((r, i) => {
      const yy = y + 42 + i * 36;
      text(ctx, r[0], x + 30, yy, { size: 17, color: '#e8dcc8' });
      text(ctx, r[1], x + 280, yy, { size: 17, align: 'right', weight: 700, color: '#fff' });
      text(ctx, r[2] ? `+${fmt(r[2])}` : '0', x + w - 30, yy, { size: 17, align: 'right', weight: 800, family: FONT.num, color: r[2] ? '#ffe070' : '#777' });
    });
    text(ctx, 'SCORE', x + 30, y + 280, { size: 18, weight: 800, family: FONT.num, color: COLORS.dim });
    text(ctx, fmt(this.scoreShown), x + w - 30, y + 282, { size: 28, align: 'right', weight: 900, family: FONT.num, color: '#fff' });
    if (this.rankShown) {
      const k = ease.outBack(clamp((this.t - this.rankShown) / 0.4, 0, 1));
      ctx.save(); ctx.translate(x + w + 90, y + 150); ctx.scale(k * 1.0, k * 1.0); ctx.rotate(-0.15);
      text(ctx, 'RANK', 0, -70, { size: 18, align: 'center', weight: 800, family: FONT.num, color: '#e8d8c0' });
      text(ctx, this.rank.r, 0, 30, { size: 120, align: 'center', weight: 900, family: FONT.logo, color: this.rank.c, ow: 8 });
      ctx.restore();
      text(ctx, `보상 ${fmt(this.goldReward)} G`, vw / 2, y + 336, { size: 18, align: 'center', weight: 800, color: '#ffd84a' });
      if (Math.floor(this.t * 2) % 2 === 0) text(ctx, input.touchMode ? '화면을 터치하세요' : 'Z / Enter 로 계속', vw / 2, vh - 30, { size: 15, align: 'center', color: COLORS.dim });
    }
  }
}
