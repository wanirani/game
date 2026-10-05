// 기록/시스템 탭: 모험 기록(통계) · 스테이지 랭크 · 드라큘라의 유물 · 저장(마을에서만) · 설정 · 타이틀로
// + 클라우드: 로그인 상태와 '지금 동기화'(로그인 안 했으면 '로그인' → 계정 화면). 계정을 쓸 수 없는 환경이면 안내 한 줄
// 2부(이계)는 플레이어가 알 때만 (access.p2Known): 스테이지 기록 2부 7칸 · 세계의 심장 · 별의 조각 · 비전서 총수 (MASTER_PLAN §1.14)
// 휴대폰 UI 배율(uiScale)에서도 넘치지 않게 줄 높이·단추 높이를 남는 자리에 맞춘다. 단추는 ui.taps 등록부 (44 CSS px 이상)
import { text, FONT } from '../../core/ui.js';
import { audio } from '../../core/audio.js';
import { clamp, fmtTime } from '../../core/math.js';
import { input } from '../../core/input.js';
import { drawIcon } from '../../render/icons.js';
import { getDiff } from '../../data/difficulty.js';
import { Tab } from './base.js';
import { PAL, frame, heading, divider, brackets, glow, glowOval, gbutton, rr, glyph, Confirm, measure, ellipsize } from './common.js';
import * as D from './access.js';
import { cloud } from '../../core/cloud.js';
import { drawCloudIcon, accountBadge, slotsJosa } from '../front/cloud_ui.js';

const RANK_COL = { D: '#a0a0a0', C: '#7ee07e', B: '#5aa8ff', A: '#c07cff', S: '#ffa640', SS: '#ff5a4a', SSS: '#ffe070' };

export class SystemTab extends Tab {
  constructor(m) { super(m); this.i = 0; this.btns = []; }
  get canSave() { return !this.world || this.world.mode === 'town'; }
  actions() {
    const g = this.game;
    const acts = [
      { id: 'save', label: '저장하기', icon: 'save', disabled: !this.canSave, sub: this.canSave ? `슬롯 ${this.state.slot ?? 1}에 기록` : '세이브 포인트에서 저장할 수 있습니다', run: () => this.save() },
      { id: 'options', label: '설정', icon: 'gear', disabled: !g.registry.options, sub: g.registry.options ? '소리 · 화면 · 조작' : '준비 중입니다', run: () => { audio.sfx('menu_ok'); g.push('options', {}); } },
      { id: 'title', label: '타이틀로', icon: 'door', sub: '진행 중인 모험을 떠납니다', run: () => this.toTitle() },
    ];
    // 클라우드 (계정을 쓸 수 있는 환경에서만 버튼)
    if (cloud.eligible() && g.registry.account) {
      if (!cloud.loggedIn) acts.push({ id: 'cloud', label: '로그인', sub: '게스트 · 로그인하면 클라우드에 보관', run: () => { audio.sfx('menu_ok'); g.push('account', { overlay: true, screen: 'login' }); } });
      else acts.push({ id: 'cloud', label: this.syncing ? '동기화 중…' : '지금 동기화', disabled: this.syncing, sub: `${cloud.id} · ${cloud.overall().short}`, run: () => this.syncNow() });
    }
    return acts;
  }
  async syncNow() {
    if (this.syncing) return;
    audio.sfx('menu_ok');
    this.syncing = true;
    // 이미 저장된 기록만 주고받는다 (지금 게임 중인 슬롯은 받지 않는다 — cloud.activeSlot)
    const out = await cloud.syncNow();
    this.syncing = false;
    if (!out?.ok) { this.m.notify(out?.message ?? '동기화하지 못했습니다', PAL.bad); return; }
    if (out.conflicts.length) this.m.notify(`슬롯 ${out.conflicts.join(', ')}: 클라우드 기록과 달라요 — 타이틀의 세이브 슬롯 화면에서 고르세요`, PAL.warn);
    else if (out.failed.length) this.m.notify(`${slotsJosa(out.failed, '을', '를')} 동기화하지 못했습니다`, PAL.bad);
    else if (out.held.length) this.m.notify(`슬롯 ${out.held.join(', ')}: 다른 기기에 더 최근 기록이 있어요 — 타이틀의 이어하기에서 받을 수 있습니다`, PAL.warn);
    else this.m.notify('클라우드와 동기화했습니다', PAL.good);
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
    const touch = input.touchMode;
    const RW = Math.round(clamp(A.w * 0.33, 270, 360));
    const LW = A.w - RW - 12;
    frame(ctx, A.x, A.y, LW, A.h);
    heading(ctx, '모험 기록', A.x + 16, A.y + 26, LW - 32, { sub: `슬롯 ${st.slot ?? 1}` });
    const S = st.stats || {}, P = st.progress || {};
    const run = this.world?.run;
    // 2부를 알면 2부 스테이지·세계의 심장·별의 조각도 (모르면 1부만 — MASTER_PLAN §1.14)
    const p2 = D.p2Known(st);
    const DOCS = D.DOCS();
    const docsTotal = Object.keys(DOCS).filter((id) => p2 || !D.isP2Stage(DOCS[id]?.stage)).length || 20;
    const chap = P.chapter ?? 0;
    const rows = [
      ['플레이 시간', fmtTime(S.playTime ?? 0)],
      ['난이도', getDiff(st.difficulty)?.name ?? st.difficulty ?? '-'],
      ['진행', chap ? (chap >= 14 ? `2부 · ${chap}장 돌파` : `${chap}장까지 돌파`) : '1장 진행 중'],
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
      ...(p2 ? [['세계의 심장', `${P.hearts?.length ?? 0} / 6`], ['별의 조각', `${P.shards?.length ?? 0} / 6`]] : []),
    ];
    // 배치: 폭이 되면 3열. 높이가 모자라면 줄 높이·제목 간격을 줄인다 (휴대폰 UI 배율 · 최소 720×400)
    let cols = LW >= 520 ? 3 : 2, fs = 13;
    let nRows = Math.ceil(rows.length / cols);
    let rh = 21, hg = 30, boxH = 44;
    const need = () => nRows * rh + hg + 12 + boxH + hg + 12 + 40;
    if (need() > A.h - 56) { rh = 20; hg = 26; boxH = 38; }
    if (need() > A.h - 56) { rh = 18; hg = 24; boxH = 34; }
    if (need() > A.h - 56 && cols === 2) { cols = 3; fs = 12; nRows = Math.ceil(rows.length / cols); } // 좁고 낮은 화면: 3열 · 작은 글자
    const cw = (LW - 32 - (cols - 1) * 12) / cols;
    rows.forEach(([k, v], i) => {
      const cx = A.x + 16 + (i % cols) * (cw + 12), cy = A.y + 42 + Math.floor(i / cols) * rh;
      if (Math.floor(i / cols) % 2 === 0) { ctx.fillStyle = 'rgba(255,230,200,0.03)'; ctx.fillRect(cx, cy, cw, rh); }
      const vw = measure(ctx, v, fs + 1, 800, FONT.num);
      text(ctx, ellipsize(ctx, k, cw - vw - 20, fs, 600), cx + 6, cy + rh - 6, { size: fs, weight: 600, color: PAL.text, ow: 2 });
      text(ctx, v, cx + cw - 6, cy + rh - 6, { size: fs + 1, align: 'right', weight: 800, family: FONT.num, color: PAL.bone, ow: 3 });
    });
    // 스테이지 기록: 1부 13칸 · (2부를 알면) 이어서 2부 7칸
    let y = A.y + 42 + nRows * rh + hg;
    heading(ctx, '스테이지 기록', A.x + 16, y, LW - 32, { size: 14, sub: p2 ? '제1부 · 제2부' : null });
    y += 12;
    // 외전(s21, side)은 열렸을 때만 2부 칸 끝에 (docs/specs/ex_s21.md)
    const sideIds = D.STAGE_ORDER_P2().filter((sid) => D.STAGES()[sid]?.side && (P.unlocked || []).includes(sid));
    const p1Ids = D.STAGE_ORDER_P1(), p2Ids = p2 ? [...D.P2_STAGE_IDS, ...sideIds] : [];
    const all = [...p1Ids, ...p2Ids], pgap = p2Ids.length ? 12 : 0;
    const bgap = all.length > 14 ? 3 : 4;
    const mw = Math.min(48, (LW - 32 - (all.length - 1) * bgap - pgap) / Math.max(1, all.length));
    ctx.save();
    all.forEach((sid, k) => {
      const part2 = k >= p1Ids.length;
      const cx = A.x + 16 + k * (mw + bgap) + (part2 ? pgap : 0), c = P.cleared?.[sid];
      const open = (P.unlocked || []).includes(sid);
      rr(ctx, cx, y, mw, boxH, 4);
      ctx.fillStyle = c ? (part2 ? 'rgba(48,18,70,0.9)' : 'rgba(60,14,28,0.9)') : 'rgba(14,8,14,0.9)'; ctx.fill();
      ctx.strokeStyle = c ? (part2 ? '#a878e8' : PAL.goldMid) : open ? PAL.goldDim : '#2e2428'; ctx.lineWidth = 1; ctx.stroke();
      const side = !!D.STAGES()[sid]?.side;
      text(ctx, side ? '외전' : String(D.stageChapter(sid) ?? k + 1), cx + mw / 2, y + 13, { size: side ? 9 : 10, align: 'center', weight: 800, family: side ? FONT.body : FONT.num, color: c ? PAL.dim : PAL.faint, ow: 2, maxWidth: mw - 2 });
      const my = y + boxH * 0.66;
      if (c?.rank) {
        const col = RANK_COL[c.rank] ?? PAL.bone;
        glow(ctx, cx + mw / 2, my - 4, Math.min(14, mw * 0.6), col, 0.35);
        const fs = c.rank.length > 2 || mw < 30 ? (mw < 26 && c.rank.length > 2 ? 10 : 12) : 16;
        text(ctx, c.rank, cx + mw / 2, my + fs * 0.36, { size: fs, align: 'center', weight: 900, family: FONT.num, color: col, ow: 3 });
      } else if (c) glyph(ctx, 'check', cx + mw / 2, my, 12, PAL.good, 2);
      else if (!open) glyph(ctx, 'lock', cx + mw / 2, my, 10, '#4a3e40', 1.3);
    });
    if (p2Ids.length) { const lx = A.x + 16 + p1Ids.length * (mw + bgap) + pgap / 2 - bgap / 2; ctx.fillStyle = 'rgba(190,140,255,0.45)'; ctx.fillRect(lx - 0.5, y - 2, 1, boxH + 4); }
    ctx.restore();
    // 유물
    y += boxH + hg;
    const relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'];
    const got = relics.filter((id) => (P.relics || []).includes(id)).length;
    heading(ctx, '드라큘라의 유물', A.x + 16, y, LW - 32, { size: 14, sub: `${got} / 5` });
    y += 12;
    const rw = Math.min(118, (LW - 32 - 4 * 8) / 5);
    const ih = Math.max(24, A.y + A.h - 12 - y);
    relics.forEach((id, k) => {
      const cx = A.x + 16 + k * (rw + 8);
      const have = (P.relics || []).includes(id);
      const b = D.ITEMS()[id];
      rr(ctx, cx, y, rw, ih, 4);
      ctx.fillStyle = have ? 'rgba(70,6,20,0.85)' : 'rgba(10,6,10,0.85)'; ctx.fill();
      ctx.strokeStyle = have ? '#c83040' : '#2e2428'; ctx.lineWidth = 1; ctx.stroke();
      const iy = ih > 54 ? y + ih * 0.42 : y + ih / 2;
      if (have) { glow(ctx, cx + rw / 2, iy, 26, '#ff2040', 0.45 + 0.15 * Math.sin(t * 2 + k)); drawIcon(ctx, b?.icon ?? `relic_${k + 1}`, cx + rw / 2, iy, Math.min(40, ih * 0.7)); }
      else text(ctx, '?', cx + rw / 2, iy + 8, { size: Math.min(24, ih * 0.6), align: 'center', weight: 900, family: FONT.num, color: '#3a2e32', ow: 0 });
      if (ih > 54) text(ctx, have ? (b?.name ?? '유물') : '???', cx + rw / 2, y + ih - 8, { size: 11, align: 'center', weight: 700, color: have ? '#ff9aa6' : PAL.faint, ow: 2, maxWidth: rw - 6 });
    });

    // ── 오른쪽: 시스템 ──
    const RX = A.x + LW + 12;
    frame(ctx, RX, A.y, RW, A.h);
    heading(ctx, '시스템', RX + 16, A.y + 26, RW - 32);
    const acts = this.actions();
    this.btns.length = 0;
    const hasCloud = acts.some((a) => a.id === 'cloud');
    const main = acts.filter((a) => a.id !== 'cloud').length;
    const cloudH = touch ? 50 : 52, foot = hasCloud ? cloudH + 14 : (!cloud.eligible() ? 32 : 10);
    // 단추 높이: 쓸 수 있는 높이에 맞춰 (터치 최소 46 · 44 CSS px 이상)
    const gap = 10, avail = A.h - 46 - foot - 8;
    const bh = clamp(Math.floor((avail - (main - 1) * gap) / Math.max(1, main)), touch ? 46 : 42, touch ? 64 : 58);
    acts.forEach((a, k) => {
      // 클라우드 단추는 오른쪽 칸 맨 아래에 따로 둔다
      const r = a.id === 'cloud'
        ? { x: RX + 16, y: A.y + A.h - 14 - cloudH, w: RW - 32, h: cloudH }
        : { x: RX + 16, y: A.y + 46 + k * (bh + gap), w: RW - 32, h: bh };
      this.btns.push(this.m.ges.zone(r, 'primary', { src: 'system.' + a.id, disabled: false }));
      const sel = k === this.i;
      gbutton(ctx, r, a.label, { hot: sel && (focused || this.m.ges.over(r)), disabled: a.disabled, icon: a.icon, size: bh < 50 ? 15 : 16, t, sub: bh < 48 && a.id !== 'cloud' ? null : a.sub, accent: a.id === 'title' ? '#6a1020' : undefined });
      if (a.id === 'cloud') drawCloudIcon(ctx, r.x + 24, r.y + r.h / 2, 26, cloud.loggedIn ? (this.syncing ? 'pending' : accountBadge().status) : 'guest', t);
      if (sel && focused) brackets(ctx, r.x, r.y, r.w, r.h, t);
    });
    if (!hasCloud && !cloud.eligible()) {
      drawCloudIcon(ctx, RX + 30, A.y + A.h - 24, 20, 'blocked', t);
      text(ctx, '클라우드 저장은 공식 사이트·앱에서 사용할 수 있습니다', RX + 46, A.y + A.h - 20, { size: 11, weight: 600, color: PAL.dim, maxWidth: RW - 62 });
    }
    // 저장 안내 (남는 자리에만)
    const iy = A.y + 46 + main * (bh + gap) + 8;
    const room = A.y + A.h - foot - 6 - iy;
    if (room >= 30) {
      divider(ctx, RX + 16, iy, RW - 32, { center: false, a: 0.4 });
      const saved = st.savedAt ? new Date(st.savedAt) : null;
      const when = saved ? `${saved.getMonth() + 1}월 ${saved.getDate()}일 ${String(saved.getHours()).padStart(2, '0')}:${String(saved.getMinutes()).padStart(2, '0')}` : '기록 없음';
      text(ctx, '마지막 저장', RX + 20, iy + 22, { size: 12, weight: 700, color: PAL.dim });
      text(ctx, when, RX + RW - 20, iy + 22, { size: 13, align: 'right', weight: 800, color: PAL.bone });
      if (!this.canSave && room >= 84) {
        glowOval(ctx, RX + RW / 2, iy + 54, RW * 0.4, 20, '#4a2a80', 0.25);
        glyph(ctx, 'save', RX + 28, iy + 50, 14, '#b0a0ff', 1.5);
        text(ctx, '스테이지 안에서는 세이브 포인트(빛나는 석판)', RX + 44, iy + 48, { size: 11, weight: 600, color: '#c8c0e8', maxWidth: RW - 60 });
        text(ctx, '또는 마을에서 저장할 수 있습니다.', RX + 44, iy + 64, { size: 11, weight: 600, color: '#c8c0e8', maxWidth: RW - 60 });
      } else if (this.canSave && this.game.settings?.autoSave && room >= 50) {
        text(ctx, '자동 저장이 켜져 있습니다', RX + 20, iy + 42, { size: 11, weight: 600, color: PAL.dim });
      }
    }
  }
}
