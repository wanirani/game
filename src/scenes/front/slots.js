// 세이브 슬롯 선택: 슬롯 3개(초상화·레벨·직업·챕터·플레이 시간·난이도·저장 일시) + 동작(불러오기/새로 시작/삭제/코드 내보내기·가져오기)
// 로그인 중이면 들어올 때 클라우드 목록을 받아 슬롯마다 구름 상태(동기화됨/서버가 최신/기기가 최신/충돌)를 보이고,
// 클라우드에서 받기·클라우드에 올리기(충돌이면 두 기록을 나란히 보여 주는 cloudConflict)를 제공한다
// 플랫폼 (platform §6.2 · §6.3 · §4.5, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - uiScale 장면 (game.uiW × game.uiH, 최소 720×400): 카드 높이는 화면 높이에 맞춘다. 동작 목록 줄 ≥ 36 CSS px, 넘치면 두 줄로
//  - 뒤로 버튼은 ui.taps (owner = 장면), 안내 줄은 지금 기기의 글리프
//  - 슬롯 표시는 migrateState 를 거친 기록으로 그린다 (B103: 손상된 캐릭터·직업·난이도 id 는 hasOwn 으로 거른다)
//  - 챕터는 20장까지, 2부(STAGES[id].part === 2)면 '제2부' 표시
import { Scene } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, FONT, ListMenu, taps } from '../../core/ui.js';
import { clamp, ease, fmt, rgba } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES } from '../../data/classes.js';
import { getDiff, DIFFICULTIES } from '../../data/difficulty.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { migrateState } from '../../game/state.js';
import { bus } from '../../core/events.js';
import { cloud } from '../../core/cloud.js';
import { drawCloudBadge, accountBadge, summaryLine } from './cloud_ui.js';
import {
  Ambience, kenBurns, shade, frame, heading, portraitIn, menuItem, backButton, footer,
  fmtDate, fmtPlay, goSafe, follow, GOLD, BONE, DIM, CRIMSON,
} from './common.js';

const own = (o, k) => typeof k === 'string' && !!o && Object.hasOwn(o, k);
const P2_COLOR = '#b98cff';

export class SlotsScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ mode = 'load', index = null } = {}) {
    this.mode = mode;
    const q = this.game.tier === 'low' ? 0.5 : 1;
    this.amb = new Ambience({ embers: Math.round(40 * q), motes: Math.round(20 * q), bats: 5, lightning: false });
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
    this.menu = new ListMenu(3, { index: clamp(Number(idx) || 0, 0, 2) });
    this.act = null; // 동작 선택 팝업
    this.selK = [0, 0, 0];
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
  exit() { this.alive = false; for (const off of this.offs ?? []) off(); }
  onResume() { this.refresh(); }
  refresh() {
    const on = cloud.loggedIn;
    this.slots = saves.list().map((s) => {
      const c = on ? cloud.slotInfo(s.slot) : null;
      if (s.empty) return { ...s, cloud: c };
      const raw = saves.read(s.slot);
      let st = null;
      try { st = raw ? migrateState(raw) : null; } catch (e) { console.error(e); }
      const P = st?.progress ?? {};
      const unlocked = Array.isArray(P.unlocked) ? P.unlocked : ['s01'];
      const far = STAGE_ORDER.filter((id) => unlocked.includes(id)).pop() ?? 's01';
      // 표시는 정리된 기록 기준 (B103: 알 수 없는 id 는 hasOwn 으로 거른다)
      const charId = own(CHARACTERS, st?.charId) ? st.charId : own(CHARACTERS, s.charId) ? s.charId : null;
      const hero = charId ? st?.heroes?.[charId] : null;
      const classId = hero?.classId ?? s.classId;
      const len = (a) => (Array.isArray(a) ? a.length : 0);
      return {
        ...s, charId, broken: !st || !charId, raw: st, stage: own(STAGES, far) ? STAGES[far] : null,
        level: hero?.level ?? s.level ?? 1, difficulty: st?.difficulty ?? s.difficulty,
        relics: len(P.relics), docs: len(P.docs), shards: len(P.shards), hearts: len(P.hearts),
        heroes: Object.keys(st?.heroes ?? {}).filter((id) => own(CHARACTERS, id)),
        cls: own(CLASSES, classId) ? CLASSES[classId].name : '', cloud: c,
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
    const up = cloud.loggedIn && !s.empty && !s.broken && st !== 'synced' ? [['cloudUp', '클라우드에 올리기', 'DEVICE → CLOUD']] : [];
    const items = s.empty
      ? [...down, ['new', '새로 시작', 'NEW GAME'], ['import', '코드 가져오기', 'IMPORT'], ['back', '취소', 'CANCEL']]
      : s.broken
        ? [...down, ['new', '새로 시작', 'NEW GAME'], ['import', '코드 가져오기', 'IMPORT'], ['delete', '삭제', 'DELETE'], ['back', '취소', 'CANCEL']]
        : [['load', '불러오기', 'LOAD'], ...down, ...up, ['new', '새로 시작', 'NEW GAME'], ['export', '코드 내보내기', 'EXPORT'], ['import', '코드 가져오기', 'IMPORT'], ['delete', '삭제', 'DELETE'], ['back', '취소', 'CANCEL']];
    const start = this.mode === 'new' ? Math.max(0, items.findIndex((i) => i[0] === 'new')) : 0;
    const cols = this.actionCols(items.length);
    this.act = { items, cols, menu: new ListMenu(items.length, { cols, index: start }), t: 0 };
    audio.sfx('menu_ok');
  }
  /** 동작 목록이 화면 높이에 한 줄로 들어가지 않으면 두 줄 (§6.3: 줄 높이는 줄이지 않는다) */
  actionCols(n) { const L = this.layout(); return n * L.ih + 30 > L.H - L.st - L.sb - 60 ? 2 : 1; }
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
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    for (let i = 0; i < 3; i++) this.selK[i] = follow(this.selK[i], i === this.menu.index ? 1 : 0, dt, 12);
    if (taps.hit(this) === 'back') { if (this.act) { this.act = null; audio.sfx('menu_cancel'); } else this.leave(); return; }
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

  /** 배치 (UI 좌표): 제목 · 카드 3장 · 안내 줄. 카드 높이는 화면 높이에 맞춰 84~112 */
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const compact = H < 480;
    const headY = st + (compact ? 38 : 50), headSize = compact ? 26 : 30;
    const top = headY + headSize * 0.72 + (compact ? 32 : 50);
    const bottom = H - 38 - sb;
    const gap = compact ? 8 : 12;
    const h = clamp(Math.floor((bottom - top - 2 * gap) / 3), 84, 112);
    const w = Math.min(680, W - sl - sr - 200);
    const x0 = sl + (W - sl - sr) / 2 - w / 2;
    const ih = clamp(Math.ceil(38 / per), 44, 48);
    return { W, H, sl, sr, st, sb, compact, headY, headSize, top, h, gap, w, x0, ih };
  }

  render(ctx) {
    const g = this.game, t = g.time;
    const L = this.layout(), W = L.W, H = L.H;
    kenBurns(ctx, assets.get('bg/s04_hall'), W, H, t, { z0: 1.05, z1: 1.12, period: 60 });
    ctx.fillStyle = 'rgba(6,2,10,0.62)'; ctx.fillRect(0, 0, W, H);
    shade(ctx, W, H, { top: 0.6, bottom: 0.8, vig: 0.8 });
    this.amb.draw(ctx, W, H, 'back', t);
    this.amb.draw(ctx, W, H, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, W / 2, L.headY, this.mode === 'new' ? 'NEW GAME' : 'CONTINUE', this.mode === 'new' ? '기록할 슬롯을 선택하세요' : '이어서 할 기록을 선택하세요', { size: L.headSize, alpha: ap });

    this.menu.clearHits();
    this.slots.forEach((s, i) => {
      const k = ease.outCubic(clamp((this.t - 0.08 * i) / 0.45, 0, 1));
      const sel = this.selK[i];
      const r = { x: L.x0 - (1 - k) * 80 + sel * 10, y: L.top + i * (L.h + L.gap), w: L.w, h: L.h };
      if (!this.act) this.menu.hit(i, r);
      this.drawSlot(ctx, r, s, sel, k, i === this.menu.index);
    });
    if (this.act) this.drawActions(ctx, L);
    if (cloud.loggedIn) {
      // 오른쪽 위: 로그인한 계정과 전체 동기화 상태
      const ab = accountBadge();
      const xr = W - 18 - L.sr;
      const bw = drawCloudBadge(ctx, xr, L.st + 28, this.cloudBusy ? 'pending' : ab.status, g.time, { size: 13, label: ab.label });
      if (this.cloudBusy) text(ctx, '클라우드 확인 중…', xr - bw - 8, L.st + 32, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
    }
    backButton(ctx, 14 + L.sl, 12 + L.st, '뒤로', this);
    footer(ctx, W, H, this.act ? '↑↓ 선택   Z 결정   X 닫기' : '↑↓ 슬롯 선택   Z 결정   X 타이틀로', this.act ? '동작을 선택하세요' : '슬롯을 터치하세요');
  }

  drawSlot(ctx, r, s, sel, k, current) {
    const t = this.game.time, h = r.h;
    const ch = !s.empty && own(CHARACTERS, s.charId) ? CHARACTERS[s.charId] : null;
    const diff = s.empty ? null : (DIFFICULTIES.find((d) => d.id === s.difficulty) ?? getDiff('normal'));
    const acc = s.empty || !ch ? '#6a5a50' : diff.color;
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
    const midX = r.x + r.w / 2 + 18, midY = r.y + r.h / 2;
    if (s.empty || !ch) {
      const cl = this.cloudOf(s);
      text(ctx, s.empty ? '— 빈 슬롯 —' : '— 읽을 수 없는 기록 —', midX, midY - 4, { size: 20, align: 'center', weight: 800, family: FONT.title, color: s.empty ? (current ? '#f0e0c8' : '#8a7a70') : '#ff9a8a', ow: 3 });
      const sub = cl ? `클라우드: ${summaryLine(cl.summary)}` : s.empty ? '새로운 사냥의 기록을 남길 수 있습니다' : '삭제하거나 코드를 가져와 덮어쓸 수 있습니다';
      text(ctx, sub, midX, midY + 22, { size: 13, align: 'center', weight: cl ? 700 : 500, color: cl ? '#9fd8ff' : DIM, ow: 2, maxWidth: r.w - 80 });
      this.drawCloud(ctx, r.x + r.w - 18, r.y + 24, s);
      ctx.restore();
      return;
    }
    // 초상화
    const pw = Math.round(clamp(h * 0.86, 72, 96));
    const pr = { x: r.x + 46, y: r.y + 8, w: pw, h: h - 16 };
    portraitIn(ctx, ch.portrait ? assets.get(ch.portrait) : null, pr, { zoom: 1.5, fy: 0.12, fallback: ch.look?.primary ?? '#3a2418' });
    ctx.strokeStyle = rgba(acc, 0.9); ctx.lineWidth = 1.5; ctx.strokeRect(pr.x + 0.5, pr.y + 0.5, pr.w - 1, pr.h - 1);
    if (current) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 4);
      ctx.fillStyle = GOLD; ctx.fillRect(pr.x, pr.y, pr.w, pr.h); ctx.restore();
    }
    // 가운데 열: 이름 · 레벨/직업 · 챕터 · 수집품 (카드 높이에 비례해 줄 위치를 정한다)
    const tx = pr.x + pr.w + 16, rx = r.x + r.w - 18;
    const y1 = r.y + Math.round(h * 0.29), y2 = r.y + Math.round(h * 0.52), y3 = r.y + Math.round(h * 0.75), y4 = r.y + Math.round(h * 0.92);
    const colW = Math.max(120, rx - 150 - tx);
    text(ctx, ch.name ?? s.charId, tx, y1, { size: 20, weight: 800, family: FONT.title, color: '#fff2dc', ow: 3, maxWidth: colW });
    text(ctx, `Lv.${s.level}`, tx, y2, { size: 18, weight: 900, family: FONT.num, color: GOLD, ow: 3 });
    text(ctx, s.cls || ch.title || '', tx + 66, y2 - 1, { size: 13, weight: 700, color: '#d8c8b8', ow: 2, maxWidth: colW - 66 });
    // 챕터 (20장까지, 2부면 '제2부' 표시)
    const st = s.stage;
    let cx = tx;
    if (st?.part === 2) {
      ctx.font = `800 11px ${FONT.body}`;
      const bw = ctx.measureText('제2부').width + 12;
      ctx.fillStyle = rgba(P2_COLOR, 0.2); ctx.fillRect(cx, y3 - 13, bw, 17);
      ctx.strokeStyle = rgba(P2_COLOR, 0.85); ctx.lineWidth = 1; ctx.strokeRect(cx + 0.5, y3 - 12.5, bw - 1, 16);
      text(ctx, '제2부', cx + bw / 2, y3, { size: 11, align: 'center', weight: 800, color: P2_COLOR, ow: 2 });
      cx += bw + 8;
    }
    text(ctx, st ? `CHAPTER ${st.chapter}  ·  ${st.name}` : '프롤로그', cx, y3, { size: 14, weight: 700, color: '#e8d8c0', ow: 2, maxWidth: colW - (cx - tx) });
    // 보조 정보
    const icons = [];
    if (s.relics) icons.push(`유물 ${s.relics}/5`);
    if (s.docs) icons.push(`비전서 ${s.docs}`);
    if (s.hearts) icons.push(`세계의 심장 ${s.hearts}/6`);
    if (s.shards) icons.push(`별의 조각 ${s.shards}/6`);
    if (s.heroes.length > 1) icons.push(`동료 ${s.heroes.length}명`);
    if (icons.length && y4 - y3 >= 13) text(ctx, icons.join('  ·  '), tx, y4, { size: 11, color: DIM, ow: 2, maxWidth: colW });
    // 오른쪽 열: 난이도 칩 · 구름 · 플레이 시간 · 골드 · 저장 일시
    ctx.font = `800 12px ${FONT.body}`;
    const dw = ctx.measureText(diff.name).width + 22;
    const cy = r.y + Math.round(h * 0.13);
    ctx.fillStyle = rgba(diff.color, 0.18); ctx.fillRect(rx - dw, cy, dw, 22);
    ctx.strokeStyle = rgba(diff.color, 0.8); ctx.lineWidth = 1; ctx.strokeRect(rx - dw + 0.5, cy + 0.5, dw - 1, 21);
    text(ctx, diff.name, rx - dw / 2, cy + 16, { size: 12, align: 'center', weight: 800, color: diff.color, ow: 2 });
    this.drawCloud(ctx, rx - dw - 12, cy + 11, s);
    text(ctx, `플레이 ${fmtPlay(s.playTime)}`, rx, r.y + Math.round(h * 0.54), { size: 13, align: 'right', weight: 700, color: BONE, ow: 2 });
    text(ctx, `${fmt(s.gold)} G`, rx, r.y + Math.round(h * 0.72), { size: 13, align: 'right', weight: 800, color: '#ffd84a', ow: 2 });
    text(ctx, fmtDate(s.savedAt), rx, r.y + Math.round(h * 0.9), { size: 11, align: 'right', weight: 600, family: FONT.num, color: DIM, ow: 2 });
    ctx.restore();
  }

  /** 슬롯 카드의 구름 상태 (로그인 중일 때만) */
  drawCloud(ctx, xr, y, s) {
    const c = s.cloud;
    if (!c || c.status === 'guest' || (c.status === 'empty' && !c.busy)) return;
    drawCloudBadge(ctx, xr, y, c.busy || (this.cloudBusy && c.status === 'unknown') ? 'pending' : c.status, this.game.time, { size: 11 });
  }

  drawActions(ctx, L) {
    const a = this.act, k = ease.outBack(clamp(a.t / 0.25, 0, 1));
    const W = L.W, H = L.H;
    const n = a.items.length, cols = a.cols, rows = Math.ceil(n / cols);
    const iw = 230, ih = L.ih, w = cols * iw + (cols - 1) * 8 + 28, h = rows * ih + 30;
    const sr = L.top + this.menu.index * (L.h + L.gap);
    const x = Math.min(W - w - 16 - L.sr, L.x0 + L.w - w + 30), y = clamp(sr + L.h / 2 - h / 2, L.st + 64, Math.max(L.st + 64, H - h - 40 - L.sb));
    ctx.fillStyle = `rgba(0,0,0,${0.45 * clamp(a.t / 0.2, 0, 1)})`; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(0.85 + 0.15 * k, 0.85 + 0.15 * k); ctx.translate(-(x + w / 2), -(y + h / 2));
    ctx.globalAlpha = clamp(a.t / 0.15, 0, 1);
    frame(ctx, x, y, w, h, { glow: 1, fill0: 'rgba(30,10,22,0.97)' });
    text(ctx, `SLOT ${this.slots[this.menu.index].slot}`, x + w / 2, y - 8, { size: 12, align: 'center', weight: 900, family: FONT.num, color: GOLD, ow: 3 });
    // 확대 연출이 끝난 뒤의 자리로 판정한다 (연출 중에 누른 탭도 보이는 자리와 거의 같다)
    a.items.forEach(([id, label, sub], i) => {
      const c = i % cols, rI = Math.floor(i / cols);
      const r = { x: x + 14 + c * (iw + 8), y: y + 15 + rI * ih, w: iw, h: ih };
      a.menu.hit(i, r);
      menuItem(ctx, r, label, { selected: a.menu.index === i, sub, size: 17, accent: id === 'delete' ? '#c0102a' : CRIMSON });
    });
    ctx.restore();
  }
}
