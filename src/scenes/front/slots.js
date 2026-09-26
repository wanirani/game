// 세이브 슬롯 선택: 슬롯 3개(초상화·레벨·직업·챕터·플레이 시간·난이도·저장 일시) + 동작(불러오기/새로 시작/삭제/코드 내보내기·가져오기)
// 로그인 중이면 들어올 때 클라우드 목록을 받아 슬롯마다 구름 상태(동기화됨/서버가 최신/기기가 최신/충돌)를 보이고,
// 클라우드에서 받기·클라우드에 올리기(충돌이면 두 기록을 나란히 보여 주는 cloudConflict)를 제공한다
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, fmt, rgba } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES } from '../../data/classes.js';
import { getDiff } from '../../data/difficulty.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { migrateState } from '../../game/state.js';
import { bus } from '../../core/events.js';
import { cloud } from '../../core/cloud.js';
import { drawCloudBadge, accountBadge, summaryLine, spinner } from './cloud_ui.js';
import {
  Ambience, kenBurns, shade, frame, heading, portraitIn, gbutton, menuItem, backButton, footer, setPad,
  fmtDate, fmtPlay, goSafe, follow, TapZones, GOLD, BONE, DIM, CRIMSON,
} from './common.js';

export class SlotsScene extends Scene {
  enter({ mode = 'load', index = null } = {}) {
    setPad(false);
    this.mode = mode;
    this.amb = new Ambience({ embers: 40, motes: 20, bats: 5, lightning: false });
    this.refresh();
    let idx = index;
    if (idx === null) {
      if (mode === 'new') idx = Math.max(0, this.slots.findIndex((s) => s.empty));
      else {
        let best = -1, bt = -1;
        this.slots.forEach((s, i) => { if (!s.empty && (s.savedAt ?? 0) > bt) { bt = s.savedAt ?? 0; best = i; } });
        idx = Math.max(0, best);
      }
    }
    this.menu = new ListMenu(3, { index: idx });
    this.act = null; // 동작 선택 팝업
    this.selK = [0, 0, 0];
    this.taps = new TapZones();
    // 클라우드 (로그인 중일 때만)
    this.alive = true;
    this.cloudBusy = false;
    this.offs = [
      bus.on('cloud:sync', (e) => { if (e?.phase === 'done' && this.alive) this.refresh(); }),
      bus.on('cloud:logout', () => { if (this.alive) this.refresh(); }),
    ];
    if (cloud.loggedIn) {
      this.cloudBusy = true;
      cloud.refresh({ reason: 'slots' }).then((out) => {
        if (!this.alive) return;
        this.cloudBusy = false;
        this.refresh();
        if (out?.ok && out.downloaded.length) this.game.toast(`클라우드에서 슬롯 ${out.downloaded.join(', ')}의 기록을 받았습니다`, '#9fe8ff');
        else if (out && !out.ok && out.error !== 'logged_out') this.game.toast(out.message ?? '클라우드에 연결하지 못했습니다', '#ffb070');
      });
    }
  }
  exit() { this.alive = false; for (const off of this.offs ?? []) off(); setPad(true); }
  onResume() { setPad(false); this.refresh(); }
  refresh() {
    const on = cloud.loggedIn;
    this.slots = saves.list().map((s) => {
      const c = on ? cloud.slotInfo(s.slot) : null;
      if (s.empty) return { ...s, cloud: c };
      const raw = saves.read(s.slot);
      const st = raw ? migrateState(raw) : null;
      const unlocked = st?.progress?.unlocked ?? ['s01'];
      const far = STAGE_ORDER.filter((id) => unlocked.includes(id)).pop() ?? 's01';
      return {
        ...s, raw: st, stage: STAGES[far], relics: st?.progress?.relics?.length ?? 0, docs: st?.progress?.docs?.length ?? 0,
        heroes: Object.keys(st?.heroes ?? {}), cls: CLASSES[s.classId]?.name ?? '', cloud: c,
      };
    });
  }
  /** 클라우드에 이 슬롯의 기록이 있는가 → 클라우드 항목 {rev, summary, …} 또는 null */
  cloudOf(s) { const c = s?.cloud?.cloud; return cloud.loggedIn && c && !c.empty ? c : null; }
  /** 클라우드 작업 실행 + 결과 알림 */
  cloudRun(p, okMsg) {
    this.act = null;
    this.cloudBusy = true;
    p.then((r) => {
      if (!this.alive) return;
      this.cloudBusy = false;
      this.refresh();
      if (r?.ok) { audio.sfx('save'); this.game.toast(okMsg, '#9fe8ff'); }
      else if (r?.error === 'conflict') this.game.toast('다른 기기에서 저장한 클라우드 기록과 달라 올리지 않았습니다. 다시 골라 주세요.', '#ffb070', 3.2);
      else this.game.toast(r?.message ?? '처리하지 못했습니다', '#ff9a9a');
    });
  }
  openActions() {
    const s = this.slots[this.menu.index];
    const st = s.cloud?.status;
    const down = this.cloudOf(s) && st !== 'synced' ? [['cloudDown', '클라우드에서 받기', 'CLOUD → DEVICE']] : [];
    const up = cloud.loggedIn && !s.empty && st !== 'synced' ? [['cloudUp', '클라우드에 올리기', 'DEVICE → CLOUD']] : [];
    const items = s.empty
      ? [...down, ['new', '새로 시작', 'NEW GAME'], ['import', '코드 가져오기', 'IMPORT'], ['back', '취소', 'CANCEL']]
      : [['load', '불러오기', 'LOAD'], ...down, ...up, ['new', '새로 시작', 'NEW GAME'], ['export', '코드 내보내기', 'EXPORT'], ['import', '코드 가져오기', 'IMPORT'], ['delete', '삭제', 'DELETE'], ['back', '취소', 'CANCEL']];
    const start = this.mode === 'new' ? Math.max(0, items.findIndex((i) => i[0] === 'new')) : 0;
    this.act = { items, menu: new ListMenu(items.length, { index: start }), t: 0 };
    audio.sfx('menu_ok');
  }
  doAction(id) {
    const g = this.game, s = this.slots[this.menu.index], slot = s.slot;
    switch (id) {
      case 'back': this.act = null; audio.sfx('menu_cancel'); break;
      case 'load': {
        const raw = saves.read(slot);
        if (!raw) { g.toast('기록을 읽을 수 없습니다', '#ff6060'); return; }
        audio.sfx('save');
        g.state = migrateState(raw);
        g.state.slot = slot;
        g.flash('#ff2040', 0.3, 3);
        goSafe(g, 'hub', { from: 'load' }, { fadeTime: 0.6 });
        break;
      }
      case 'new': {
        const cl = this.cloudOf(s);
        const start = () => { if (cloud.loggedIn) cloud.markOverwrite(slot); g.go('difficulty', { slot }); };
        if (!s.empty || cl) {
          const message = s.empty
            ? `클라우드에 슬롯 ${slot}의 기록(${summaryLine(cl.summary)})이 있습니다. 새로 시작하면 클라우드의 이 기록을 새 기록으로 덮어씁니다.`
            : `슬롯 ${slot}의 기록을 지우고 새로운 사냥을 시작할까요? 이 작업은 되돌릴 수 없습니다.${cl ? ' 클라우드에 보관된 이 슬롯의 기록도 새 기록으로 바뀝니다.' : ''}`;
          g.push('frontConfirm', { title: '새로 시작', message, yes: '새로 시작', no: '취소', danger: true, onYes: start });
        } else { audio.sfx('menu_ok'); start(); }
        break;
      }
      case 'delete': {
        const cl = this.cloudOf(s);
        g.push('frontConfirm', {
          title: '기록 삭제', yes: '삭제', no: '취소', danger: true,
          message: cl ? `슬롯 ${slot}의 기록을 이 기기와 클라우드에서 모두 영구히 삭제합니다. 정말 삭제할까요?` : `슬롯 ${slot}의 기록을 영구히 삭제합니다. 정말 삭제할까요?`,
          onYes: () => {
            saves.remove(slot); audio.sfx('break_wall'); g.toast(`슬롯 ${slot}의 기록을 삭제했습니다`, '#ff9a9a'); this.act = null; this.refresh();
            if (cl) {
              cloud.removeSlot(slot, cl.rev).then((r) => {
                if (!this.alive) return;
                this.refresh();
                if (!r?.ok) g.toast(r?.error === 'changed' ? r.message : '클라우드 기록은 지금 지우지 못했습니다. 다음에 연결되면 지웁니다.', '#ffb070', 3.2);
              });
            }
          },
        });
        break;
      }
      case 'cloudDown': {
        if (s.empty) this.cloudRun(cloud.download(slot), `슬롯 ${slot}에 클라우드 기록을 받았습니다`);
        else g.push('cloudConflict', { slot, mode: s.cloud?.status === 'conflict' ? 'conflict' : 'download', onDone: (ok) => { if (ok) this.act = null; this.refresh(); } });
        break;
      }
      case 'cloudUp': {
        const cl = this.cloudOf(s);
        if (!cl || s.cloud?.status === 'local') this.cloudRun(cloud.upload(slot), `슬롯 ${slot}의 기록을 클라우드에 올렸습니다`);
        else g.push('cloudConflict', { slot, mode: s.cloud?.status === 'conflict' ? 'conflict' : 'upload', onDone: (ok) => { if (ok) this.act = null; this.refresh(); } });
        break;
      }
      case 'export': g.push('saveCode', { mode: 'export', slot }); break;
      case 'import': g.push('saveCode', { mode: 'import', slot, onDone: (ok) => { if (ok) { this.act = null; this.refresh(); } } }); break;
    }
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.viewW, g.viewH);
    for (let i = 0; i < 3; i++) this.selK[i] = follow(this.selK[i], i === this.menu.index ? 1 : 0, dt, 12);
    if (this.taps.hit() === 'back') { if (this.act) { this.act = null; audio.sfx('menu_cancel'); } else this.leave(); return; }
    if (this.act) {
      this.act.t += dt;
      const r = this.act.menu.update(dt);
      if (this.act.menu.moved) audio.sfx('menu_move');
      if (r === 'confirm') this.doAction(this.act.items[this.act.menu.index][0]);
      else if (r === 'cancel') { this.act = null; audio.sfx('menu_cancel'); }
      return;
    }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'confirm') {
      const s = this.slots[this.menu.index];
      if (s.empty && this.mode === 'new' && !this.cloudOf(s)) { audio.sfx('menu_ok'); g.go('difficulty', { slot: s.slot }); }
      else this.openActions();
    } else if (r === 'cancel') this.leave();
  }
  leave() { audio.sfx('menu_cancel'); this.game.go('title', { menu: true, index: this.mode === 'new' ? 0 : 1 }); }

  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    kenBurns(ctx, assets.get('bg/s04_hall'), vw, vh, t, { z0: 1.05, z1: 1.12, period: 60 });
    ctx.fillStyle = 'rgba(6,2,10,0.62)'; ctx.fillRect(0, 0, vw, vh);
    shade(ctx, vw, vh, { top: 0.6, bottom: 0.8, vig: 0.8 });
    this.amb.draw(ctx, vw, vh, 'back', t);
    this.amb.draw(ctx, vw, vh, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, vw / 2, 50, this.mode === 'new' ? 'NEW GAME' : 'CONTINUE', this.mode === 'new' ? '기록할 슬롯을 선택하세요' : '이어서 할 기록을 선택하세요', { size: 30, alpha: ap });

    const w = Math.min(680, vw - 200), x0 = vw / 2 - w / 2, h = 112;
    this.menu.clearHits(); this.taps.clear();
    this.slots.forEach((s, i) => {
      const k = ease.outCubic(clamp((this.t - 0.08 * i) / 0.45, 0, 1));
      const sel = this.selK[i];
      const r = { x: x0 - (1 - k) * 80 + sel * 10, y: 122 + i * (h + 12), w, h };
      if (!this.act) this.menu.hit(i, r);
      this.drawSlot(ctx, r, s, sel, k, i === this.menu.index);
    });
    if (this.act) this.drawActions(ctx, vw, vh);
    if (cloud.loggedIn) {
      // 오른쪽 위: 로그인한 계정과 전체 동기화 상태
      const ab = accountBadge();
      const bw = drawCloudBadge(ctx, vw - 18, 28, this.cloudBusy ? 'pending' : ab.status, g.time, { size: 13, label: ab.label });
      if (this.cloudBusy) text(ctx, '클라우드 확인 중…', vw - 18 - bw - 8, 32, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
    }
    backButton(ctx, 14, 12, '뒤로', this.taps);
    footer(ctx, vw, vh, this.act ? '↑↓ 선택   Z 결정   X 닫기' : '↑↓ 슬롯 선택   Z 결정   X 타이틀로', this.act ? '동작을 선택하세요' : '슬롯을 터치하세요');
  }

  drawSlot(ctx, r, s, sel, k, current) {
    const t = this.game.time;
    const diff = s.empty ? null : getDiff(s.difficulty);
    const acc = s.empty ? '#6a5a50' : diff.color;
    ctx.save();
    ctx.globalAlpha = k;
    frame(ctx, r.x, r.y, r.w, r.h, { accent: current ? GOLD : '#8a6a3a', glow: sel * 0.9, fill0: current ? 'rgba(46,12,24,0.92)' : 'rgba(22,10,24,0.86)', edge: 0.5 + sel * 0.5 });
    // 슬롯 번호
    ctx.save();
    ctx.fillStyle = current ? CRIMSON : 'rgba(80,20,30,0.8)';
    ctx.fillRect(r.x, r.y, 38, r.h);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(r.x + 36, r.y, 2, r.h);
    ctx.translate(r.x + 19, r.y + r.h / 2); ctx.rotate(-Math.PI / 2);
    text(ctx, `SLOT ${s.slot}`, 0, 5, { size: 13, align: 'center', weight: 900, family: FONT.num, color: current ? '#ffe7a0' : '#c8a8a0', ow: 2 });
    ctx.restore();
    if (s.empty) {
      const cl = this.cloudOf(s);
      text(ctx, '— 빈 슬롯 —', r.x + r.w / 2 + 18, r.y + r.h / 2 - 4, { size: 20, align: 'center', weight: 800, family: FONT.title, color: current ? '#f0e0c8' : '#8a7a70', ow: 3 });
      if (cl) text(ctx, `클라우드: ${summaryLine(cl.summary)}`, r.x + r.w / 2 + 18, r.y + r.h / 2 + 22, { size: 13, align: 'center', weight: 700, color: '#9fd8ff', ow: 2 });
      else text(ctx, '새로운 사냥의 기록을 남길 수 있습니다', r.x + r.w / 2 + 18, r.y + r.h / 2 + 22, { size: 13, align: 'center', color: DIM, ow: 2 });
      this.drawCloud(ctx, r.x + r.w - 18, r.y + 24, s);
      ctx.restore();
      return;
    }
    const ch = CHARACTERS[s.charId];
    // 초상화
    const pr = { x: r.x + 46, y: r.y + 8, w: 96, h: r.h - 16 };
    portraitIn(ctx, assets.get(ch?.portrait), pr, { zoom: 1.5, fy: 0.12 });
    ctx.strokeStyle = rgba(acc, 0.9); ctx.lineWidth = 1.5; ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    if (current) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 4);
      ctx.fillStyle = GOLD; ctx.fillRect(pr.x, pr.y, pr.w, pr.h); ctx.restore();
    }
    const tx = pr.x + pr.w + 16;
    text(ctx, ch?.name ?? s.charId, tx, r.y + 32, { size: 20, weight: 800, family: FONT.title, color: '#fff2dc', ow: 3 });
    text(ctx, `Lv.${s.level}`, tx, r.y + 58, { size: 18, weight: 900, family: FONT.num, color: GOLD, ow: 3 });
    text(ctx, s.cls || ch?.title || '', tx + 66, r.y + 57, { size: 13, weight: 700, color: '#d8c8b8', ow: 2 });
    // 챕터
    const st = s.stage;
    text(ctx, st ? `CHAPTER ${st.chapter}  ·  ${st.name}` : '프롤로그', tx, r.y + 84, { size: 14, weight: 700, color: '#e8d8c0', ow: 2 });
    // 보조 정보
    const icons = [];
    if (s.relics) icons.push(`유물 ${s.relics}/5`);
    if (s.docs) icons.push(`비전서 ${s.docs}`);
    if (s.heroes.length > 1) icons.push(`동료 ${s.heroes.length}명`);
    if (icons.length) text(ctx, icons.join('  ·  '), tx, r.y + 102, { size: 11, color: DIM, ow: 2 });
    // 오른쪽 열
    const rx = r.x + r.w - 18;
    // 난이도 칩
    ctx.font = `800 12px ${FONT.body}`;
    const dw = ctx.measureText(diff.name).width + 22;
    ctx.fillStyle = rgba(diff.color, 0.18); ctx.fillRect(rx - dw, r.y + 14, dw, 22);
    ctx.strokeStyle = rgba(diff.color, 0.8); ctx.lineWidth = 1; ctx.strokeRect(rx - dw + 0.5, r.y + 14.5, dw - 1, 21);
    text(ctx, diff.name, rx - dw / 2, r.y + 30, { size: 12, align: 'center', weight: 800, color: diff.color, ow: 2 });
    this.drawCloud(ctx, rx - dw - 12, r.y + 25, s);
    text(ctx, `플레이 ${fmtPlay(s.playTime)}`, rx, r.y + 60, { size: 13, align: 'right', weight: 700, color: BONE, ow: 2 });
    text(ctx, `${fmt(s.gold)} G`, rx, r.y + 80, { size: 13, align: 'right', weight: 800, color: '#ffd84a', ow: 2 });
    text(ctx, fmtDate(s.savedAt), rx, r.y + 100, { size: 11, align: 'right', weight: 600, family: FONT.num, color: DIM, ow: 2 });
    ctx.restore();
  }

  /** 슬롯 카드의 구름 상태 (로그인 중일 때만) */
  drawCloud(ctx, xr, y, s) {
    const c = s.cloud;
    if (!c || c.status === 'guest' || (c.status === 'empty' && !c.busy)) return;
    drawCloudBadge(ctx, xr, y, c.busy || (this.cloudBusy && c.status === 'unknown') ? 'pending' : c.status, this.game.time, { size: 11 });
  }

  drawActions(ctx, vw, vh) {
    const a = this.act, k = ease.outBack(clamp(a.t / 0.25, 0, 1));
    const n = a.items.length, iw = 230, ih = 46, w = iw + 28, h = n * ih + 30;
    const sr = 122 + this.menu.index * 124;
    const x = Math.min(vw - w - 16, vw / 2 + Math.min(680, vw - 200) / 2 - w + 30), y = clamp(sr + 56 - h / 2, 70, vh - h - 40);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * clamp(a.t / 0.2, 0, 1)})`; ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.globalAlpha = clamp(a.t / 0.15, 0, 1);
    frame(ctx, x, y, w, h, { glow: 1, fill0: 'rgba(30,10,22,0.97)' });
    text(ctx, `SLOT ${this.slots[this.menu.index].slot}`, x + w / 2, y - 8, { size: 12, align: 'center', weight: 900, family: FONT.num, color: GOLD, ow: 3 });
    a.items.forEach(([id, label, sub], i) => {
      const r = { x: x + 14, y: y + 15 + i * ih, w: iw, h: ih };
      a.menu.hit(i, r);
      menuItem(ctx, r, label, { selected: a.menu.index === i, sub, size: 17, accent: id === 'delete' ? '#c0102a' : CRIMSON });
    });
    ctx.restore();
  }
}
