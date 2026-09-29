// 의뢰 게시판: 받을 수 있는 의뢰 / 진행 중(달성 시 보상 받기) / 완료 — 양피지 의뢰서 연출, 보상 팝업
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { text, wrap, button, bar, FONT, COLORS, font } from '../../core/ui.js';
import { fmt, rand, clamp, TAU, RNG, hashStr } from '../../core/math.js';
import * as Q from '../../game/quests.js';
import { QUESTS } from '../../data/quests.js';
import { ITEMS } from '../../data/items.js';
import { SCRIPTS } from '../../data/story.js';
import { drawIcon } from '../../render/icons.js';
import { ServiceScene, ScrollList, Modal, RewardPopup, makeInst, hitRect, npcInfo, uiButton } from './common.js';
import { vGrad, rGrad, fillGradRect, fillPathGrad } from '../menu/common.js';
// 게시판 그라디언트 색 멈춤 (menu/common 캐시 — 매 프레임 새 그라디언트 0, R1-REQ-341B)
const BOARD = [0, '#5a3a22', 1, '#2a1a0e'], NOTE_ON = [0, '#efe2c0', 1, '#c8b48a'], NOTE_FADED = [0, '#8a7a60', 1, '#5a4a38'];
const PAPER = [0, '#eadcb8', 1, '#c4ae84'], PAPER_DONE = [0, '#a89878', 1, '#7a6a50'];
const DETAIL = [0, '#efe4c6', 0.7, '#d6c49a', 1, '#a88a5a'];
import { glow } from './facades.js';

const INK = '#2a1a10', INK2 = '#5a4630';

function questOf(x) { return typeof x === 'string' ? QUESTS[x] : x; }
function giverName(q) {
  if (!q?.giver) return q?.kind === 'main' ? '메인 퀘스트' : '';
  if (q.giver === 'board') return '게시판';
  return npcInfo(q.giver).name || q.giver;
}

export class QuestBoardScene extends ServiceScene {
  // 알림은 오른쪽 상세 패널 아래쪽에 띄운다 (좁은 왼쪽 목록을 가리지 않게)
  get toastX() { const d = this.detailRect; return d ? d.x + d.w / 2 : super.toastX; }
  get toastY() { const d = this.detailRect; return d ? d.y + d.h - 14 : super.toastY; }
  get toastW() { const d = this.detailRect; return d ? d.w - 16 : super.toastW; }
  setup() {
    this.bgKey = 'bg/hub'; this.title = '의뢰 게시판'; this.eng = 'NOTICE BOARD'; this.npcId = null;
    this.music = null; this.emberColor = '#c8ff90';
    this.tabs = [{ id: 'avail', label: '새 의뢰' }, { id: 'active', label: '진행 중' }, { id: 'done', label: '완료' }];
    this.list = this.addList(64);
    this.refresh();
    this.talk(this.readyCount() ? `보상을 받을 수 있는 의뢰가 ${this.readyCount()}건 있다!` : this.avail.length ? `새로 붙은 의뢰서가 ${this.avail.length}장 있다.` : '오늘은 새 의뢰가 없는 모양이다.');
    if (this.readyCount() && !this.avail.length) { this.tab = 1; this.refresh(); }
  }
  readyCount() { try { return (Q.activeQuests?.(this.state) ?? []).filter((q) => Q.canClaim(this.state, q.id)).length; } catch { return 0; } }
  onTab() { this.list.index = 0; this.list.scroll = this.list.target = 0; this.refresh(); }
  refresh() {
    const st = this.state;
    let avail = [], active = [], done = [];
    try { avail = (Q.availableQuests(st) || []).map(questOf).filter(Boolean); } catch (e) { console.error(e); }
    try { active = (Q.activeQuests ? Q.activeQuests(st) : Object.keys(st.quests?.active || {}).map(questOf)).filter(Boolean); } catch (e) { console.error(e); }
    try { done = (Q.completedQuests ? Q.completedQuests(st) : (st.quests?.done || []).map(questOf)).filter(Boolean).reverse(); } catch (e) { console.error(e); }
    active.sort((a, b) => (Q.canClaim(st, b.id) - Q.canClaim(st, a.id)) || ((a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1)));
    this.avail = avail; this.active = active; this.done = done;
    this.entries = [avail, active, done][this.tab];
    this.list.setCount(this.entries.length);
    const rc = active.filter((q) => Q.canClaim(st, q.id)).length;
    this.tabs[0].badge = avail.length ? String(avail.length) : '';
    this.tabs[1].badge = rc ? '★' : '';
  }
  get cur() { return this.entries[this.list.index] ?? null; }

  updateBody(dt) {
    const r = this.list.update(dt);
    if (this.list.moved) audio.sfx('menu_move', { vol: 0.5 });
    if (this.tapId === 'act' && this.cur) { this.act(); return 'handled'; }
    if (r === 'confirm' && this.cur) this.act();
    return r;
  }
  act() {
    const q = this.cur, st = this.state;
    if (!q) return;
    if (this.tab === 0) {
      audio.sfx('menu_ok');
      this.modal = new Modal({
        title: '의뢰를 받겠습니까?', lines: [`「${q.name}」`, Q.rewardText ? `보상: ${Q.rewardText(q.id)}` : ''].filter(Boolean), width: 500,
        buttons: [{ label: '의뢰서를 뗀다', value: 'ok', primary: true }, { label: '그만둔다', value: 'cancel' }],
        onResult: (res) => {
          if (res.value !== 'ok') return;
          if (Q.acceptQuest(st, q.id)) {
            audio.sfx('item'); this.talk(`「${q.name}」 의뢰서를 품에 넣었다.`);
            this.paperFx();
            this.refresh();
            this.playQuestScript(q.id, 'start');
          } else { audio.sfx('menu_cancel'); this.game.toast('지금은 받을 수 없는 의뢰다.', '#ff8a7a'); }
        },
      });
    } else if (this.tab === 1) {
      if (!Q.canClaim(st, q.id)) { audio.sfx('menu_cancel'); this.talk('아직 의뢰를 끝내지 못했다. ' + (Q.questProgressText(st, q.id) || '')); return; }
      const out = Q.claimQuest(st, q.id);
      if (!out) { audio.sfx('menu_cancel'); this.game.toast('보상을 받을 수 없다. (재료를 확인하자)', '#ff8a7a'); return; }
      audio.sfx('win'); audio.sfx('coin');
      const items = (out.items || []).map((i) => { const m = makeInst(i.id); if (m) m.qty = i.qty ?? 1; return m; }).filter(Boolean);
      this.popup = new RewardPopup({ title: '의뢰 완료!', sub: `「${q.name}」${out.levelUps ? `  ·  레벨 업 +${out.levelUps}` : ''}`, gold: out.gold, exp: out.exp, items, color: '#ffd84a' });
      this.popup.onClose = () => {
        this.refresh();
        const after = () => this.talk(this.readyCount() ? '아직 보상을 받을 의뢰가 남아 있다.' : '의뢰서에 완료 도장을 찍었다.');
        if (!this.playQuestScript(q.id, 'done', after)) after();
      };
    }
  }
  /**
   * 의뢰 대사 (STORY-P2-B #85): 받을 때 q_<id>_start, 보상을 받은 뒤 q_<id>_done 이 SCRIPTS 에 있으면 대화창으로 보여 준다.
   * 대사가 없으면 아무것도 하지 않고 false. onEnd 는 대화가 끝난 뒤 (게시판으로 돌아왔을 때)
   */
  playQuestScript(id, kind, onEnd) {
    const sid = `q_${id}_${kind}`;
    const g = this.game;
    if (!SCRIPTS[sid] || !g.registry?.dialogue) return false;
    const P = this.state?.progress;
    if (P && Array.isArray(P.seenScripts) && !P.seenScripts.includes(sid)) P.seenScripts.push(sid);
    g.push('dialogue', { script: sid, world: this.world ?? g.world ?? null, onEnd });
    return true;
  }
  paperFx() {
    const d = this.detailRect;
    if (!d) return;
    this.fx.burst('dust', d.x + d.w / 2, d.y + 40, 14, { speed: 120, color: '#d8c8a0' });
    this.fx.burst('gold', d.x + d.w / 2, d.y + 40, 16, { speed: 180 });
  }

  // ── 그리기 ──
  /** 왼쪽 칸(게시판 삽화 + 안내문)은 다른 가게보다 좁다 */
  portraitW(vw, compact) { return Math.round(compact ? clamp(vw * 0.22, 196, 250) : clamp(vw * 0.22, 210, 280)); }
  renderPortrait(ctx, L) {
    // 왼쪽: 등불 아래 게시판 삽화 + 안내문
    const x = 14, y = 70, w = L.pw - 20, h = L.vh - 70 - 130;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + w / 2, y + 30, w * 0.9, '#ffb45a', 0.28 + Math.sin(this.t * 3) * 0.03); ctx.restore();
    // 기둥 + 판
    ctx.fillStyle = '#1e120a'; ctx.fillRect(x + 12, y, 12, h + 20); ctx.fillRect(x + w - 24, y, 12, h + 20);
    ctx.translate(0, y + 20); ctx.fillStyle = vGrad(ctx, h - 20, BOARD); ctx.fillRect(x, 4, w, h - 30); ctx.translate(0, -(y + 20)); // 캐시 (y+20 → y+h)
    for (let yy = y + 36; yy < y + h - 6; yy += 14) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x, yy, w, 1.5); }
    ctx.strokeStyle = '#120a04'; ctx.lineWidth = 4; ctx.strokeRect(x, y + 24, w, h - 30);
    // 지붕
    ctx.fillStyle = '#24222f'; ctx.beginPath(); ctx.moveTo(x - 14, y + 30); ctx.lineTo(x + w / 2, y - 6); ctx.lineTo(x + w + 14, y + 30); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#07040a'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(169,194,255,0.4)'; ctx.fillRect(x + w / 2, y - 5, 1, 1);
    // 붙은 종이 (의뢰 수만큼, 최대 9)
    const n = Math.min(9, (this.avail?.length ?? 0) + (this.active?.length ?? 0));
    const rng = new RNG(hashStr('board' + n));
    for (let i = 0; i < Math.max(3, n); i++) {
      const pw = rng.range(44, 60), ph = rng.range(50, 70);
      const px = x + 14 + (i % 3) * ((w - 28) / 3) + rng.range(0, 8), py = y + 40 + Math.floor(i / 3) * ((h - 70) / 3) + rng.range(0, 10);
      ctx.save(); ctx.translate(px + pw / 2, py + ph / 2); ctx.rotate(rng.range(-0.12, 0.12) + Math.sin(this.t * 1.3 + i) * 0.01);
      const faded = i >= n;
      fillGradRect(ctx, vGrad(ctx, ph, faded ? NOTE_FADED : NOTE_ON), -pw / 2, -ph / 2, pw, ph); // 캐시 그라디언트
      ctx.fillStyle = faded ? 'rgba(40,30,20,0.3)' : 'rgba(50,30,15,0.55)';
      for (let l = 0; l < 5; l++) ctx.fillRect(-pw / 2 + 6, -ph / 2 + 12 + l * 8, (pw - 12) * rng.range(0.5, 1), 2);
      ctx.fillStyle = '#8a1426'; ctx.beginPath(); ctx.arc(0, -ph / 2 + 4, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 등불
    const lx = x + w / 2, ly = y + 14;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, lx, ly + 16, 40, '#ffb45a', 0.8); ctx.restore();
    ctx.fillStyle = '#141014'; ctx.fillRect(lx - 7, ly + 4, 14, 3); ctx.fillStyle = 'rgba(255,200,120,0.9)'; ctx.fillRect(lx - 6, ly + 7, 12, 16);
    ctx.strokeStyle = '#141014'; ctx.lineWidth = 1.5; ctx.strokeRect(lx - 6, ly + 7, 12, 16);
    // 안내문 상자
    const bx = 14, bw = L.pw - 24, bh = 108, by = L.vh - bh - 14;
    ctx.fillStyle = 'rgba(10,6,12,0.88)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(110,85,48,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const lines = wrap(ctx, this.say.text.slice(0, Math.floor(this.say.shown)), bw - 28, 14, 500);
    lines.slice(0, 4).forEach((l, i) => text(ctx, l, bx + 14, by + 28 + i * 22, { size: 14, color: '#e8dcc8', ow: 2 }));
  }

  renderBody(ctx, body) {
    const st = this.state;
    const lw = Math.round(body.w * 0.47);
    const lr = { x: body.x + 10, y: body.y, w: lw - 10, h: body.h };
    ctx.fillStyle = 'rgba(30,18,10,0.55)'; ctx.fillRect(body.x, body.y - 4, lw + 2, body.h + 8);
    const emptyTxt = ['지금 받을 수 있는 의뢰가 없다.', '진행 중인 의뢰가 없다.', '아직 완료한 의뢰가 없다.'][this.tab];
    this.list.draw(ctx, lr, (c, i, r, sel) => this.paperRow(c, r, sel, this.entries[i]), emptyTxt);
    const dr = { x: body.x + lw + 12, y: body.y, w: body.w - lw - 12, h: body.h - 60 };
    this.detailRect = dr;
    const q = this.cur;
    this.drawParchment(ctx, dr, q);
    this.actRect = this.tz('act', { x: dr.x, y: dr.y + dr.h + 10, w: dr.w, h: 50 });
    if (!q) { uiButton(ctx, this.actRect, '—', { disabled: true }); return; }
    if (this.tab === 0) uiButton(ctx, this.actRect, '의뢰 받기', { selected: true, size: 18 });
    else if (this.tab === 1) {
      const ok = Q.canClaim(st, q.id);
      uiButton(ctx, this.actRect, ok ? '★ 보상 받기' : q.auto ? '스테이지를 클리어하면 자동 완료' : '진행 중…', { selected: ok, size: ok ? 18 : 15, color: ok ? '#ffe070' : '#a89880' });
    } else uiButton(ctx, this.actRect, '완료한 의뢰', { disabled: true, size: 16 });
  }

  paperRow(ctx, r, sel, q) {
    const st = this.state;
    const ready = this.tab === 1 && Q.canClaim(st, q.id);
    const main = q.kind === 'main';
    ctx.save();
    ctx.beginPath(); ctx.moveTo(r.x + 3, r.y); ctx.lineTo(r.x + r.w - 2, r.y + 2); ctx.lineTo(r.x + r.w, r.y + r.h - 1); ctx.lineTo(r.x, r.y + r.h); ctx.closePath();
    fillPathGrad(ctx, vGrad(ctx, r.h, this.tab === 2 ? PAPER_DONE : PAPER), 0, r.y); // 캐시 그라디언트
    ctx.fillStyle = 'rgba(90,60,30,0.18)'; ctx.fillRect(r.x, r.y + r.h - 8, r.w, 8);
    if (sel) { ctx.strokeStyle = COLORS.gold; ctx.lineWidth = 3; ctx.shadowColor = 'rgba(255,210,120,0.7)'; ctx.shadowBlur = 12; ctx.strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2); ctx.shadowBlur = 0; }
    // 핀 / 인장
    ctx.fillStyle = main ? '#a01020' : '#6a4a2a'; ctx.beginPath(); ctx.arc(r.x + 22, r.y + r.h / 2, main ? 11 : 6, 0, TAU); ctx.fill();
    if (main) { ctx.strokeStyle = '#e8c872'; ctx.lineWidth = 1.5; ctx.stroke(); text(ctx, '★', r.x + 22, r.y + r.h / 2 + 5, { size: 13, weight: 900, align: 'center', color: '#ffe7a0', ow: 0 }); }
    text(ctx, q.name, r.x + 42, r.y + 26, { size: 16, weight: 800, family: FONT.title, color: INK, outline: null, ow: 0, maxWidth: r.w - 120 });
    const sub = this.tab === 1 ? (Q.questProgressText(st, q.id) || '') : giverName(q);
    text(ctx, sub, r.x + 42, r.y + 47, { size: 12, color: INK2, outline: null, ow: 0, maxWidth: r.w - 60 });
    if (this.tab === 1) {
      let p = null; try { p = Q.questProgress?.(st, q.id); } catch { p = null; }
      if (p) { ctx.fillStyle = 'rgba(60,40,20,0.3)'; ctx.fillRect(r.x + r.w - 88, r.y + 18, 72, 6); ctx.fillStyle = ready ? '#3a8a2a' : '#8a5a1a'; ctx.fillRect(r.x + r.w - 88, r.y + 18, 72 * clamp(p.cur / Math.max(1, p.need), 0, 1), 6); }
    }
    if (ready) {
      const pulse = 0.6 + Math.sin(this.t * 6) * 0.4;
      ctx.save(); ctx.translate(r.x + r.w - 34, r.y + r.h / 2 + 6); ctx.rotate(-0.2);
      ctx.strokeStyle = `rgba(170,20,30,${0.7 + pulse * 0.3})`; ctx.lineWidth = 2.5; ctx.strokeRect(-26, -12, 52, 22);
      text(ctx, '달성', 0, 5, { size: 13, weight: 900, align: 'center', color: '#a01020', outline: null, ow: 0 });
      ctx.restore();
    }
    if (this.tab === 2) text(ctx, '완료', r.x + r.w - 16, r.y + r.h / 2 + 5, { size: 13, weight: 900, align: 'right', color: '#5a2a10', outline: null, ow: 0 });
    ctx.restore();
  }

  drawParchment(ctx, r, q) {
    const rng = new RNG(hashStr(q?.id ?? 'x'));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + 4);
    for (let x = r.x; x <= r.x + r.w; x += 16) ctx.lineTo(x, r.y + rng.range(0, 5));
    for (let y = r.y; y <= r.y + r.h; y += 18) ctx.lineTo(r.x + r.w - rng.range(0, 4), y);
    for (let x = r.x + r.w; x >= r.x; x -= 16) ctx.lineTo(x, r.y + r.h - rng.range(0, 5));
    for (let y = r.y + r.h; y >= r.y; y -= 18) ctx.lineTo(r.x + rng.range(0, 4), y);
    ctx.closePath();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16; // 원점 기준 캐시 그라디언트 (그림자는 변환과 무관)
    fillPathGrad(ctx, rGrad(ctx, 0, 0, 20, Math.max(r.w, r.h) * 0.75, DETAIL), r.x + r.w / 2, r.y + r.h / 2); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(80,50,20,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (!q) { text(ctx, '의뢰서를 고르세요', r.x + r.w / 2, r.y + r.h / 2, { size: 16, align: 'center', color: INK2, outline: null, ow: 0 }); ctx.restore(); return; }
    const st = this.state;
    const x = r.x + 22, w = r.w - 44;
    let y = r.y + 40;
    text(ctx, q.kind === 'main' ? '— 메인 퀘스트 —' : '— 의 뢰 —', r.x + r.w / 2, y - 12, { size: 11, weight: 800, align: 'center', color: '#8a1426', outline: null, ow: 0, family: FONT.title });
    text(ctx, q.name, r.x + r.w / 2, y + 14, { size: 21, weight: 800, family: FONT.title, align: 'center', color: INK, outline: null, ow: 0, maxWidth: w });
    y += 30;
    const gv = q.kind === 'main' ? '' : giverName(q);
    if (gv) { text(ctx, `의뢰인: ${gv}`, r.x + r.w / 2, y + 4, { size: 12, align: 'center', color: INK2, outline: null, ow: 0 }); y += 12; }
    ctx.fillStyle = 'rgba(90,60,30,0.4)'; ctx.fillRect(x, y + 8, w, 1.5); y += 28;
    ctx.font = font(14, 500);
    // 낮은 양피지(휴대폰)에서는 설명 줄을 줄여 목표·보상이 잘리지 않게
    const maxDesc = clamp(Math.floor((r.h - 200) / 21), 2, 5);
    for (const l of wrap(ctx, q.desc ?? '', w, 14).slice(0, maxDesc)) { text(ctx, l, x, y, { size: 14, color: INK, outline: null, ow: 0 }); y += 21; }
    y += 6;
    // 목표 / 진행
    const status = this.tab;
    let prog = null; try { prog = Q.questProgress?.(st, q.id); } catch { prog = null; }
    const ptxt = Q.questProgressText?.(st, q.id) ?? '';
    text(ctx, '목표', x, y, { size: 12, weight: 800, color: '#8a1426', outline: null, ow: 0 }); y += 18;
    text(ctx, ptxt, x, y, { size: 13, weight: 700, color: INK, outline: null, ow: 0, maxWidth: w }); y += 10;
    if (status === 1 && prog) { bar(ctx, x, y, w, 8, prog.cur / Math.max(1, prog.need), { color: prog.done ? '#4aa83a' : '#b8781a', back: 'rgba(60,40,20,0.35)', edge: '#5a4020', shine: false }); y += 16; }
    y += 10;
    // 보상
    const rw = q.reward || {};
    text(ctx, '보상', x, y, { size: 12, weight: 800, color: '#8a1426', outline: null, ow: 0 }); y += 8;
    const chips = [];
    if (rw.gold) chips.push(['coin', `${fmt(rw.gold)} G`]);
    if (rw.exp) chips.push(['gem_crystal', `EXP ${fmt(rw.exp)}`]);
    for (const it of rw.items || []) chips.push([ITEMS[it.id]?.icon ?? 'moneybag', `${ITEMS[it.id]?.name ?? it.id} ×${it.qty ?? 1}`]);
    let cx = x, cy = y + 4;
    ctx.font = font(12, 700);
    for (const [ic, label] of chips) {
      const cw = ctx.measureText(label).width + 40;
      if (cx + cw > x + w) { cx = x; cy += 30; }
      if (cy + 26 > r.y + r.h - 8) break;
      ctx.fillStyle = 'rgba(60,40,20,0.14)'; ctx.fillRect(cx, cy, cw, 26);
      drawIcon(ctx, ic, cx + 14, cy + 13, 20);
      text(ctx, label, cx + 28, cy + 18, { size: 12, weight: 700, color: INK, outline: null, ow: 0 });
      cx += cw + 6;
    }
    if (status === 2) {
      ctx.save(); ctx.translate(r.x + r.w - 70, r.y + 70); ctx.rotate(-0.25);
      ctx.strokeStyle = 'rgba(160,16,32,0.75)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 36, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
      text(ctx, '완료', 0, 7, { size: 20, weight: 900, align: 'center', color: 'rgba(160,16,32,0.85)', outline: null, ow: 0, family: FONT.title });
      ctx.restore();
    }
    ctx.restore();
  }
}
