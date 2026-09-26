// 기록/시스템 탭: 모험 기록(통계) · 스테이지 랭크 · 드라큘라의 유물 · 저장(마을에서만) · 설정 · 타이틀로
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, fmtTime } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawIcon } from '../../render/icons.js';
import { getDiff } from '../../data/difficulty.js';
import { Tab } from './base.js';
import { PAL, frame, heading, divider, brackets, glow, glowOval, gbutton, rr, glyph, Confirm } from './common.js';
import * as D from './access.js';

const RANK_COL = { D: '#a0a0a0', C: '#7ee07e', B: '#5aa8ff', A: '#c07cff', S: '#ffa640', SS: '#ff5a4a', SSS: '#ffe070' };

export class SystemTab extends Tab {
  constructor(m) { super(m); this.i = 0; this.btns = []; }
  get canSave() { return !this.world || this.world.mode === 'town'; }
  actions() {
    const g = this.game;
    return [
      { id: 'save', label: '저장하기', icon: 'save', disabled: !this.canSave, sub: this.canSave ? `슬롯 ${this.state.slot ?? 1}에 기록` : '세이브 포인트에서 저장할 수 있습니다', run: () => this.save() },
      { id: 'options', label: '설정', icon: 'gear', disabled: !g.registry.options, sub: g.registry.options ? '소리 · 화면 · 조작' : '준비 중입니다', run: () => { audio.sfx('menu_ok'); g.push('options', {}); } },
      { id: 'title', label: '타이틀로', icon: 'door', sub: '진행 중인 모험을 떠납니다', run: () => this.toTitle() },
    ];
  }
  save() {
    const st = this.state;
    try {
      this.world?.syncToState?.();
      this.game.saves?.write(st.slot ?? 1, st);
      audio.sfx('save');
      this.m.notify(`슬롯 ${st.slot ?? 1}에 저장했습니다`, PAL.good);
      this.game.flash('#fff2c0', 0.25, 3);
    } catch (e) { console.error(e); audio.sfx('menu_cancel'); this.m.notify('저장하지 못했습니다', PAL.bad); }
  }
  toTitle() {
    this.m.openModal(new Confirm({
      title: '타이틀로 돌아가기', danger: true, yes: '돌아간다', no: '취소',
      text: this.canSave ? '타이틀 화면으로 돌아갈까요?\n저장하지 않은 진행 상황은 사라집니다.' : '스테이지를 포기하고 타이틀로 돌아갈까요?\n마지막 저장 이후의 진행 상황은 사라집니다.',
      onYes: () => { try { this.world?.syncToState?.(); } catch (e) { /* 무시 */ } this.game.go('title', {}); },
    }));
  }
  run(a) { if (a.disabled) { audio.sfx('menu_cancel'); this.m.notify(a.sub, PAL.dim); return; } a.run(); }

  update(dt, nav, ges, focused) {
    const acts = this.actions();
    for (let k = 0; k < this.btns.length; k++) {
      if (ges.hoverIn(this.btns[k])) this.i = k;
      if (ges.tap(this.btns[k])) { this.m.focus = 'content'; this.i = k; this.run(acts[k]); return; }
    }
    if (!focused) return;
    if (nav.up) { if (this.i > 0) { this.i--; audio.sfx('menu_move'); } else { this.m.focusTabs(); return; } }
    if (nav.down && this.i < acts.length - 1) { this.i++; audio.sfx('menu_move'); }
    if (nav.confirm) this.run(acts[this.i]);
    if (nav.cancel) this.m.close();
  }
  hints() { return [['↑↓', '고르기'], ['Z', '결정', '버튼을 터치하세요']]; }

  render(ctx, A) {
    const t = this.t, st = this.state, focused = this.m.focus === 'content';
    const RW = Math.round(clamp(A.w * 0.33, 280, 360));
    const LW = A.w - RW - 12;
    frame(ctx, A.x, A.y, LW, A.h);
    heading(ctx, '모험 기록', A.x + 16, A.y + 26, LW - 32, { sub: `슬롯 ${st.slot ?? 1}` });
    const S = st.stats || {}, P = st.progress || {};
    const run = this.world?.run;
    const docsTotal = Object.keys(D.DOCS()).length || 20;
    const rows = [
      ['플레이 시간', fmtTime(S.playTime ?? 0)],
      ['난이도', getDiff(st.difficulty)?.name ?? st.difficulty ?? '-'],
      ['진행', P.chapter ? `${P.chapter}장까지 돌파` : '1장 진행 중'],
      ['점수', (run?.score ?? st.score ?? 0).toLocaleString('ko-KR')],
      ['남은 목숨', String(run?.lives ?? st.lives ?? 0)],
      ['쓰러뜨린 적', (S.kills ?? 0).toLocaleString('ko-KR')],
      ['보스 토벌', String(P.bosses?.length ?? S.bossKills ?? 0)],
      ['최대 콤보', `${S.maxCombo ?? 0} HIT`],
      ['쓰러진 횟수', String(S.deaths ?? 0)],
      ['모은 골드', `${(S.goldEarned ?? 0).toLocaleString('ko-KR')} G`],
      ['강화 성공 / 실패', `${S.enhanceOk ?? 0} / ${S.enhanceFail ?? 0}`],
      ['미니게임 승리', String(S.minigameWins ?? 0)],
      ['비전서', `${P.docs?.length ?? 0} / ${docsTotal}`],
      ['발견한 비밀', String(P.secrets?.length ?? 0)],
    ];
    const cw = (LW - 48) / 2, rh = 21;
    rows.forEach(([k, v], i) => {
      const cx = A.x + 18 + (i % 2) * (cw + 12), cy = A.y + 44 + Math.floor(i / 2) * rh;
      if (Math.floor(i / 2) % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.03)'; ctx.fillRect(cx, cy, cw, rh); }
      text(ctx, k, cx + 8, cy + 15, { size: 13, weight: 600, color: PAL.text, ow: 2 });
      text(ctx, v, cx + cw - 8, cy + 15, { size: 14, align: 'right', weight: 800, family: FONT.num, color: PAL.bone, ow: 3 });
    });
    // 스테이지 랭크
    let y = A.y + 44 + Math.ceil(rows.length / 2) * rh + 30;
    heading(ctx, '스테이지 기록', A.x + 16, y, LW - 32, { size: 14 });
    y += 12;
    const order = D.STAGE_ORDER();
    const mw = Math.min(48, (LW - 32 - (order.length - 1) * 4) / Math.max(1, order.length));
    order.forEach((sid, k) => {
      const cx = A.x + 16 + k * (mw + 4), c = P.cleared?.[sid];
      const open = (P.unlocked || []).includes(sid);
      rr(ctx, cx, y, mw, 44, 4);
      ctx.fillStyle = c ? 'rgba(60,14,28,0.9)' : 'rgba(14,8,14,0.9)'; ctx.fill();
      ctx.strokeStyle = c ? PAL.goldMid : open ? PAL.goldDim : '#2e2428'; ctx.lineWidth = 1; ctx.stroke();
      text(ctx, String(k + 1), cx + mw / 2, y + 14, { size: 10, align: 'center', weight: 800, family: FONT.num, color: c ? PAL.dim : PAL.faint, ow: 2 });
      if (c?.rank) {
        const col = RANK_COL[c.rank] ?? PAL.bone;
        glow(ctx, cx + mw / 2, y + 30, 14, col, 0.35);
        text(ctx, c.rank, cx + mw / 2, y + 37, { size: c.rank.length > 2 ? 12 : 16, align: 'center', weight: 900, family: FONT.num, color: col, ow: 3 });
      } else if (c) glyph(ctx, 'check', cx + mw / 2, y + 30, 12, PAL.good, 2);
      else if (!open) glyph(ctx, 'lock', cx + mw / 2, y + 30, 10, '#4a3e40', 1.3);
    });
    // 유물
    y += 44 + 32;
    const relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
    const got = relics.filter((id) => (P.relics || []).includes(id)).length;
    heading(ctx, '드라큘라의 유물', A.x + 16, y, LW - 32, { size: 14, sub: `${got} / 5` });
    y += 12;
    const rw = Math.min(118, (LW - 32 - 4 * 8) / 5);
    relics.forEach((id, k) => {
      const cx = A.x + 16 + k * (rw + 8);
      const have = (P.relics || []).includes(id);
      const b = D.ITEMS()[id];
      rr(ctx, cx, y, rw, A.y + A.h - 12 - y, 4);
      ctx.fillStyle = have ? 'rgba(70,6,20,0.85)' : 'rgba(10,6,10,0.85)'; ctx.fill();
      ctx.strokeStyle = have ? '#c83040' : '#2e2428'; ctx.lineWidth = 1; ctx.stroke();
      const ih = A.y + A.h - 12 - y;
      if (have) { glow(ctx, cx + rw / 2, y + ih * 0.42, 26, '#ff2040', 0.45 + 0.15 * Math.sin(t * 2 + k)); drawIcon(ctx, b?.icon ?? `relic_${k + 1}`, cx + rw / 2, y + ih * 0.42, Math.min(40, ih * 0.6)); }
      else text(ctx, '?', cx + rw / 2, y + ih * 0.42 + 9, { size: 24, align: 'center', weight: 900, family: FONT.num, color: '#3a2e32', ow: 0 });
      if (ih > 54) text(ctx, have ? (b?.name ?? '유물') : '???', cx + rw / 2, y + ih - 8, { size: 11, align: 'center', weight: 700, color: have ? '#ff9aa6' : PAL.faint, ow: 2, maxWidth: rw - 6 });
    });

    // ── 오른쪽: 시스템 ──
    const RX = A.x + LW + 12;
    frame(ctx, RX, A.y, RW, A.h);
    heading(ctx, '시스템', RX + 16, A.y + 26, RW - 32);
    const acts = this.actions();
    this.btns.length = 0;
    const bh = input.touchMode ? 64 : 58;
    acts.forEach((a, k) => {
      const r = { x: RX + 16, y: A.y + 46 + k * (bh + 12), w: RW - 32, h: bh };
      this.btns.push(r);
      const sel = k === this.i;
      gbutton(ctx, r, a.label, { hot: sel && (focused || this.m.ges.over(r)), disabled: a.disabled, icon: a.icon, size: 16, t, sub: a.sub, accent: a.id === 'title' ? '#6a1020' : undefined });
      if (sel && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
    });
    // 저장 안내
    const iy = A.y + 46 + acts.length * (bh + 12) + 20;
    divider(ctx, RX + 16, iy, RW - 32, { center: false, a: 0.4 });
    const saved = st.savedAt ? new Date(st.savedAt) : null;
    const when = saved ? `${saved.getMonth() + 1}월 ${saved.getDate()}일 ${String(saved.getHours()).padStart(2, '0')}:${String(saved.getMinutes()).padStart(2, '0')}` : '기록 없음';
    text(ctx, '마지막 저장', RX + 20, iy + 26, { size: 12, weight: 700, color: PAL.dim });
    text(ctx, when, RX + RW - 20, iy + 26, { size: 13, align: 'right', weight: 800, color: PAL.bone });
    if (!this.canSave) {
      glowOval(ctx, RX + RW / 2, iy + 62, RW * 0.4, 20, '#4a2a80', 0.25);
      glyph(ctx, 'save', RX + 28, iy + 58, 14, '#b0a0ff', 1.5);
      text(ctx, '스테이지 안에서는 세이브 포인트(빛나는 석판)', RX + 44, iy + 56, { size: 11, weight: 600, color: '#c8c0e8', maxWidth: RW - 60 });
      text(ctx, '또는 마을에서 저장할 수 있습니다.', RX + 44, iy + 72, { size: 11, weight: 600, color: '#c8c0e8', maxWidth: RW - 60 });
    } else if (this.game.settings?.autoSave) {
      text(ctx, '자동 저장이 켜져 있습니다', RX + 20, iy + 50, { size: 11, weight: 600, color: PAL.dim });
    }
  }
}
