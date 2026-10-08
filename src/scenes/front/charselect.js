// 캐릭터 선택: 클링 초상화 + 실시간 drawHero 미리보기(대기·연속 공격 루프), 이름/칭호/설명/능력치 별점/무기,
// 잠긴 캐릭터는 실루엣 + 해금 조건. 스토리: 새 세이브 생성 → 프롤로그 / 아케이드: 임시 세이브로 모드 시작
// 플랫폼 (platform §6.2 · §6.3 · §4.5, MASTER_PLAN §1.16) — owner: PLAT-FRONT-A
//  - uiScale 장면 (game.uiW × game.uiH, 최소 720×400). 높이가 모자라면(휴대폰) 정보 칸을 줄여 배치한다
//  - 미리보기 영웅은 채색 퍼펫(hero_puppet): 들어올 때 모든 영웅의 첫 직업을 미리 받아 둔다 (준비 전에는 벡터 그림)
//  - 시작·뒤로 버튼은 ui.taps (owner = 장면), 초상화 타일은 목록 줄(≥ 36 CSS px), 안내 줄은 지금 기기의 글리프
import { Scene } from '../../core/game.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, ListMenu, taps } from '../../core/ui.js';
import { drawHints, promptMode } from '../../core/prompts.js';
import { clamp, ease, rgba, TAU } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { MOVESETS } from '../../data/movesets.js';
import { getDiff } from '../../data/difficulty.js';
import { newGameState } from '../../game/state.js';
import { drawHero } from '../../render/hero.js';
import * as PUPPET from '../../render/hero_puppet.js';
import {
  Ambience, kenBurns, shade, frame, ornament, portraitIn, gbutton, backButton, stars, puppet,
  glowSprite, follow, linGrad, radGrad, clampLines, GOLD, BONE, DIM,
} from './common.js';
import { startArcade, ARCADE_MODES } from './arcade.js';

const WNAME = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '쌍단검', gun: '쌍권총', staff: '지팡이·성서', spear: '장창' };
const DNAME = { dash: '돌진 대시', mist: '안개 변신', roll: '구르기', blink: '순간이동' };
const STAGE_BG = { kael: 'bg/s03_gate', sera: 'bg/s11_chapel', victor: 'bg/s01_village', bran: 'bg/s04_hall', lia: 'bg/s09_clocktower', azel: 'bg/s12_throne', isolde: 'bg/s17_sky' };
/** 큰 초상화 칸의 키 아트 (애니메 초상화 설치: assets/cg/keyart_<영웅>.webp 1024×1536 불투명). 받는 중·없으면 흉상 초상화로 */
const keyArtKey = (id) => `cg/keyart_${id}`;
const ACCENT = { kael: '#e8c872', sera: '#fff2b0', victor: '#ffb060', bran: '#8ab0ff', lia: '#ff4a6a', azel: '#ff2a4a', isolde: '#6ad0e0' };

export class CharSelectScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; }
  enter({ slot = 1, difficulty = 'normal', mode = 'story', arcade = null } = {}) {
    this.slot = slot; this.difficulty = difficulty; this.mode = mode; this.arcade = arcade;
    const m = this.game.meta;
    const unlocked = (id) => !CHARACTERS[id].unlock || m?.unlockedChars?.includes(id);
    this.list = CHAR_ORDER.map((id) => ({ id, ch: CHARACTERS[id], open: unlocked(id), pup: puppet(id) }));
    const last = m?.lastChar && this.list.findIndex((c) => c.id === m.lastChar && c.open);
    this.menu = new ListMenu(this.list.length, { cols: this.list.length, index: last > 0 ? last : 0 });
    const q = this.game.tier === 'low' ? 0.5 : 1;
    this.amb = new Ambience({ embers: Math.round(50 * q), motes: Math.round(20 * q), bats: 3, lightning: false });
    this.changeT = 0; this.prev = -1; this.cur = this.menu.index;
    this.seqT = 0; this.seq = null; this.buildSeq();
    this.pick = null; this.pickT = 0;
    this.selK = this.list.map((_, i) => (i === this.cur ? 1 : 0));
    for (const c of this.list) {
      assets.get(c.ch.portrait);
      if (c.open) assets.get(keyArtKey(c.id));   // 큰 칸 키 아트 (잠긴 영웅은 흉상 실루엣이라 받지 않는다)
      assets.get(STAGE_BG[c.id] ?? 'bg/s03_gate');
      // 채색 퍼펫 (첫 직업): 미리 받아 두면 고를 때 벡터 그림이 비치지 않는다
      try { if (PUPPET.puppetEnabled?.() !== false) PUPPET.preloadPuppet?.(c.id, c.ch.rootClass); } catch (e) { console.warn(e); }
    }
  }
  get sel() { return this.list[this.menu.index]; }
  buildSeq() {
    const c = this.list[this.menu.index];
    const ms = MOVESETS[c.ch.weaponType];
    const seq = [{ idle: 1.3 }];
    for (const mv of ms?.ground ?? []) seq.push({ mv });
    seq.push({ idle: 0.7 });
    if (ms?.up) seq.push({ mv: ms.up });
    if (ms?.charge) seq.push({ idle: 0.4 }, { mv: ms.charge });
    this.seq = seq; this.seqI = 0; this.seqT = 0;
  }
  update(dt) {
    const g = this.game;
    this.amb.emberColor = ACCENT[this.sel.id] ?? GOLD;
    this.amb.update(dt, g.uiW || g.viewW, g.uiH || g.viewH);
    this.changeT += dt;
    for (let i = 0; i < this.selK.length; i++) this.selK[i] = follow(this.selK[i], i === this.menu.index ? 1 : 0, dt, 14);
    if (this.shakeT > 0) this.shakeT = Math.max(0, this.shakeT - dt);
    // 미리보기 동작 순서
    this.seqT += dt;
    const step = this.seq[this.seqI];
    const len = step.idle ?? step.cast ?? (step.mv.dur + 0.06);
    if (this.seqT >= len) { this.seqT = 0; this.seqI = (this.seqI + 1) % this.seq.length; }
    if (this.pick) {
      this.pickT += dt;
      if (this.pickT > 1.25 && !this.went) { this.went = true; this.start(); }
      return;
    }
    const tap = taps.hit(this);
    if (tap === 'back') { this.leave(); return; }
    if (tap === 'start') { this.choose(); return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) {
      audio.sfx('menu_move');
      this.prev = this.cur; this.cur = this.menu.index; this.changeT = 0;
      this.buildSeq();
    }
    if (r === 'confirm') this.choose();
    else if (r === 'cancel') this.leave();
  }
  choose() {
    const c = this.sel;
    if (!c.open) { audio.sfx('menu_cancel'); this.game.toast(`잠긴 헌터 — ${c.ch.unlock?.text ?? '조건을 만족하면 해금'}`, '#ff9a9a'); this.shakeT = 0.3; return; }
    this.pick = c; this.pickT = 0;
    audio.sfx('menu_ok'); audio.sfx('charge_ready');
    this.game.flash(c.ch.ult?.color ?? '#fff', 0.45, 2.5);
    // 선택 시 필살 준비 자세
    this.seq = [{ idle: 0.2 }, { cast: 1.2 }]; this.seqI = 0; this.seqT = 0;
  }
  start() {
    const g = this.game, c = this.pick;
    g.meta.lastChar = c.id; saves.saveMeta(g.meta);
    if (this.mode === 'arcade') { startArcade(g, this.arcade, c.id); return; }
    const st = newGameState({ slot: this.slot, difficulty: this.difficulty, charId: c.id });
    // 이미 해금된 동료(메타)도 이 세이브에서 선택 가능하도록 기록
    st.progress.flags.startChar = c.id;
    saves.write(this.slot, st);
    g.state = st;
    // 제목 카드(PROLOGUE · 핏빛 달이 뜨는 밤)는 prologue 스크립트의 {cmd:'title'} 이 띄운다 (title 인자까지 넘기면 두 번 표시됨)
    g.go('story', { script: 'prologue', then: 'hub', thenParams: { from: 'prologue' }, bg: 'cg/cg_prologue_moon', music: 'prologue' }, { fadeTime: 0.8 });
  }
  leave() {
    audio.sfx('menu_cancel');
    if (this.mode === 'arcade') this.game.go('arcade', { cfg: this.arcade });
    else this.game.go('difficulty', { slot: this.slot, index: ['easy', 'normal', 'hard', 'nightmare', 'inferno'].indexOf(this.difficulty) });
  }

  /** 배치 (UI 좌표). 높이가 500 UI px 보다 작으면 정보 칸을 줄인다 */
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const compact = H < 500;
    const pw = W * 0.5;
    const ix = pw + 10, iw = W - ix - 24 - sr;
    const n = this.list.length, gap = 8;
    const ts = Math.min(compact ? 58 : 64, (iw - (n - 1) * gap) / n);
    const tilesY = H - sb - (compact ? 120 : 132);
    const winH = compact ? 168 : 180;
    const win = { x: 16 + sl, y: H - sb - winH - 16, w: Math.min(340, pw - 40 - sl), h: winH };
    const br = { x: ix, y: H - sb - (compact ? 54 : 58), w: Math.min(250, iw * 0.6), h: 46 };
    const T = compact
      ? { hdrY: st + 30, engY: st + 58, nameY: st + 92, nameSize: 30, titleY: st + 116, titleSize: 15, ornY: st + 130, descY: st + 152, descLH: 19, rowH: 21 }
      : { hdrY: st + 40, engY: st + 82, nameY: st + 122, nameSize: 36, titleY: st + 148, titleSize: 16, ornY: st + 164, descY: st + 192, descLH: 22, rowH: 24 };
    return { W, H, sl, sr, st, sb, compact, pw, ix, iw, n, gap, ts, tilesY, win, br, T };
  }

  render(ctx) {
    const g = this.game, t = g.time;
    const L = this.layout(), W = L.W, H = L.H, T = L.T;
    const c = this.sel, ch = c.ch, acc = ACCENT[c.id] ?? GOLD;
    const ck = ease.outCubic(clamp(this.changeT / 0.4, 0, 1));
    kenBurns(ctx, assets.get('bg/s03_gate'), W, H, t, { z0: 1.05, z1: 1.12, period: 64 });
    ctx.fillStyle = 'rgba(6,2,10,0.7)'; ctx.fillRect(0, 0, W, H);
    // 캐릭터 색 광원 (영웅 색마다 한 번 만든 원점 그라데이션)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = c.open ? 1 : 0.3;
    const gr = H * 0.8;
    ctx.translate(W * 0.24, H * 0.55); ctx.scale(gr / 100, gr / 100);
    ctx.fillStyle = radGrad(ctx, `csGlow|${acc}`, 0, 0, 1, 100, [[0, rgba(acc, 0.2)], [1, rgba(acc, 0)]]);
    ctx.fillRect(-100, -100, 200, 200); ctx.restore();
    this.amb.draw(ctx, W, H, 'back', t);

    // ── 초상화 (좌측 절반) ──
    const pw = L.pw;
    const img = assets.get(ch.portrait);
    const slide = (1 - ck) * -60;
    const pr = { x: slide, y: 0, w: pw + 20, h: H };
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.75 * ck;
    const ka = c.open ? assets.get(keyArtKey(c.id)) : null;
    if (ka && ka.width > 2) portraitIn(ctx, ka, pr, { fy: 0.12, zoom: 1.02 + 0.015 * Math.sin(t * 0.4), backing: false, key: keyArtKey(c.id), fallback: ch.look.primary });
    else portraitIn(ctx, img, pr, { fy: 0.12, zoom: 1.02 + 0.015 * Math.sin(t * 0.4), silhouette: !c.open, fallback: ch.look.primary });
    // 오른쪽/아래 페이드 (화면 크기별로 한 번 만든 그라데이션)
    const fx0 = Math.round(pw * 0.55), fx1 = Math.round(pw + 20);
    ctx.fillStyle = linGrad(ctx, `csFadeR|${fx0}|${fx1}`, fx0, 0, fx1, 0, [[0, 'rgba(6,2,10,0)'], [1, 'rgba(6,2,10,1)']]);
    ctx.fillRect(fx0, 0, fx1 - fx0 + 2, H);
    const fy0 = Math.round(H * 0.55), fy1 = Math.round(H);
    ctx.fillStyle = linGrad(ctx, `csFadeB|${fy0}|${fy1}`, 0, fy0, 0, fy1, [[0, 'rgba(6,2,10,0)'], [1, 'rgba(6,2,10,0.92)']]);
    ctx.fillRect(0, fy0, pw + 22, fy1 - fy0);
    ctx.restore();
    if (!c.open) {
      text(ctx, '?', pw * 0.42, H * 0.42, { size: 150, align: 'center', weight: 900, family: FONT.logo, color: 'rgba(179,18,46,0.35)', ow: 0 });
    }
    shade(ctx, W, H, { top: 0.4, bottom: 0.2, vig: 0.6 });
    this.amb.draw(ctx, W, H, 'front', t);
    // ── 전투 미리보기 창 (무대 배경 + 받침 마법진 + drawHero) ──
    const win = L.win;
    frame(ctx, win.x - 4, win.y - 4, win.w + 8, win.h + 8, { accent: acc, glow: 0.6, corners: true, edge: 0.8 });
    ctx.save();
    ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip();
    kenBurns(ctx, assets.get(STAGE_BG[c.id] ?? 'bg/s03_gate'), win.w, win.h, t, { z0: 1.1, z1: 1.2, period: 40, px: win.x, py: win.y, alpha: 1 });
    ctx.fillStyle = 'rgba(6,2,10,0.5)'; ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.save();
    ctx.translate(win.x, win.y + win.h - 34);
    ctx.fillStyle = linGrad(ctx, 'csFloor', 0, 0, 0, 34, [[0, 'rgba(20,10,14,0.2)'], [0.15, 'rgba(40,24,26,0.95)'], [1, 'rgba(10,4,8,1)']]);
    ctx.fillRect(0, 0, win.w, 34);
    ctx.restore();
    ctx.fillStyle = rgba(acc, 0.35); ctx.fillRect(win.x, win.y + win.h - 29, win.w, 1);
    this.drawPreview(ctx, win.x + Math.min(96, win.w * 0.28), win.y + win.h - 28, c, acc, t, L.compact ? 1.4 : 1.5);
    ctx.restore();
    text(ctx, 'BATTLE PREVIEW', win.x + 10, win.y + 18, { size: 11, weight: 900, family: FONT.num, color: rgba(acc, 0.9), ow: 3 });

    // ── 정보 패널 (우측) ──
    const ix = L.ix, iw = L.iw;
    const ia = ck;
    text(ctx, this.mode === 'arcade' ? `ARCADE · ${ARCADE_MODES[this.arcade?.kind]?.name ?? ''}` : 'SELECT YOUR HUNTER', ix, T.hdrY, { size: 14, weight: 900, family: FONT.logo, color: '#c8a8a0', ow: 3 });
    const dd = getDiff(this.difficulty);
    text(ctx, dd.name, W - 24 - L.sr, T.hdrY, { size: 13, align: 'right', weight: 800, color: dd.color, ow: 3 });
    ctx.save();
    ctx.globalAlpha = ia; ctx.translate((1 - ia) * 40, 0);
    text(ctx, c.open ? ch.eng : '? ? ?', ix, T.engY, { size: 15, weight: 900, family: FONT.logo, color: acc, ow: 3 });
    ctx.shadowColor = rgba(acc, 0.6); ctx.shadowBlur = 16;
    text(ctx, c.open ? ch.name : '잠긴 헌터', ix, T.nameY, { size: T.nameSize, weight: 800, family: FONT.title, color: '#fff4e4', ow: 5, maxWidth: iw });
    ctx.shadowBlur = 0;
    text(ctx, c.open ? ch.title : 'LOCKED', ix + 2, T.titleY, { size: T.titleSize, weight: 800, color: c.open ? '#ff8a8a' : '#8a6a6a', ow: 3, maxWidth: iw });
    ornament(ctx, ix + iw / 2, T.ornY, iw, { color: acc, alpha: 0.9 });
    const desc = c.open ? ch.desc : `${ch.unlock?.text ?? '특정 조건을 만족하면 합류합니다.'}\n${ch.unlock?.hint ?? '악마성 어딘가에서 이 헌터가 당신을 기다리고 있다.'}`;
    // 능력치·무기 줄이 로스터 타일 위에 들어가도록 설명 줄 수를 정한다
    const entries = Object.entries(ch.stars ?? {});
    const statRows = Math.ceil(entries.length / 2);
    const below = statRows * T.rowH + 8 + (c.open ? 2 * (T.rowH - 3) : 0) + 10;
    const maxLines = clamp(Math.floor((L.tilesY - 8 - below - T.descY + T.descLH * 0.4) / T.descLH), 1, 4);
    const lines = clampLines(ctx, wrap(ctx, desc, iw, 14, 500), maxLines, iw); // 잘리면 '…'
    lines.forEach((l, i) => text(ctx, l, ix, T.descY + i * T.descLH, { size: 14, color: c.open ? '#e8dccb' : '#b89a9a', ow: 2 }));
    // 능력치
    const sy = T.descY + lines.length * T.descLH + 4;
    entries.forEach(([k, v], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = ix + col * (iw / 2), y = sy + row * T.rowH;
      text(ctx, k, x, y + 5, { size: 13, weight: 700, color: DIM, ow: 2 });
      stars(ctx, x + 52, y, c.open ? v : 0, 5, { color: acc, size: 14 });
    });
    const wy = sy + statRows * T.rowH + 8;
    if (c.open) {
      text(ctx, `무기  ${WNAME[ch.weaponType] ?? ch.weaponType}    이동  ${DNAME[ch.move?.dash] ?? '대시'}${ch.move?.airJumps > 1 ? ` · ${ch.move.airJumps + 1}단 점프` : ''}`, ix, wy, { size: 13, weight: 700, color: BONE, ow: 2, maxWidth: iw });
      text(ctx, `필살기  「${ch.ult?.name ?? '???'}」`, ix, wy + T.rowH - 3, { size: 13, weight: 800, color: ch.ult?.color ?? GOLD, ow: 2, maxWidth: iw });
    }
    ctx.restore();

    // ── 로스터 타일 ──
    const n = L.n, ts = L.ts, gap = L.gap;
    const tx0 = ix, ty = L.tilesY;
    this.menu.clearHits();
    this.list.forEach((it, i) => {
      const s = this.selK[i];
      const r = { x: tx0 + i * (ts + gap), y: ty - s * 6, w: ts, h: ts };
      if (!this.pick) this.menu.hit(i, { x: r.x - 2, y: ty - 8, w: ts + 4, h: ts + 12 });
      this.drawTile(ctx, r, it, s, i === this.menu.index);
    });
    // 시작 버튼 + 안내
    const br = L.br;
    gbutton(ctx, br, c.open ? (this.mode === 'arcade' ? '이 헌터로 도전' : '이 헌터로 출발') : '잠겨 있음', { selected: c.open, disabled: !c.open, accent: acc, size: 16, owner: this, id: 'start', src: 'charselect.start' });
    const hx = br.x + br.w + 14, hy = br.y + br.h / 2 + 5;
    if (promptMode() === 'touch') text(ctx, '초상화를 터치해 선택', hx, hy, { size: 12, weight: 700, color: '#a89888', ow: 2, maxWidth: W - hx - 12 });
    else drawHints(ctx, [['dpadH', '선택'], ['confirm', '결정'], ['cancel', '뒤로']], hx, hy, { size: 12, color: '#a89888' });
    backButton(ctx, 14 + L.sl, 12 + L.st, '뒤로', this);

    // 선택 확정 연출
    if (this.pick) {
      const k = clamp(this.pickT / 1.25, 0, 1);
      const bandK = ease.outExpo(clamp(this.pickT / 0.25, 0, 1));
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * bandK})`; ctx.fillRect(0, 0, W, H);
      const by = H * 0.5 - 50, bh = 100;
      ctx.beginPath(); ctx.moveTo(0, by + 14); ctx.lineTo(W, by); ctx.lineTo(W, by + bh - 14); ctx.lineTo(0, by + bh); ctx.closePath();
      ctx.fillStyle = rgba(this.pick.ch.ult?.color ?? acc, 0.22 * bandK); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(((i * 131 + this.pickT * 2600) % (W + 300)) - 150, by + 10 + (i * 29) % (bh - 20), 180, 2); }
      ctx.globalCompositeOperation = 'source-over';
      text(ctx, this.pick.ch.name, W * 0.5 + (1 - bandK) * 400, by + 60, { size: 42, align: 'center', weight: 900, family: FONT.title, color: '#fff4e0', ow: 6 });
      text(ctx, `— ${this.pick.ch.title} —`, W * 0.5 - (1 - bandK) * 400, by + 86, { size: 15, align: 'center', weight: 800, color: this.pick.ch.ult?.color ?? acc, ow: 3 });
      if (k > 0.75) { ctx.fillStyle = `rgba(0,0,0,${(k - 0.75) * 4})`; ctx.fillRect(0, 0, W, H); }
      ctx.restore();
    }
  }

  drawPreview(ctx, fx, fy, c, acc, t, sc = 2) {
    const p = c.pup;
    const step = this.seq[this.seqI];
    // 받침 마법진
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(sc / 2.2, 0.28 * sc / 2.2);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = c.open ? 0.7 : 0.3;
    ctx.drawImage(glowSprite(acc), -130, -130, 260, 260);
    ctx.strokeStyle = rgba(acc, 0.8); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 84, 0, TAU); ctx.stroke();
    ctx.rotate(t * 0.5);
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) { const a = i * TAU / 6 * 2; const x = Math.cos(a) * 84, y = Math.sin(a) * 84; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.fillStyle = rgba(acc, 0.9);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.fillRect(Math.cos(a) * 92 - 2, Math.sin(a) * 92 - 2, 4, 4); }
    ctx.restore();
    // 캐릭터
    p.t = t;
    p.facing = 1;
    if (step.mv) {
      p.move = step.mv; p.moveT = this.seqT; p.anim = step.mv.anim;
      p.muzzleT = step.mv.hit && this.seqT >= step.mv.hit[0] && this.seqT <= step.mv.hit[0] + 0.06 ? 0.05 : 0;
      p.onGround = true;
    } else if (step.cast) {
      p.move = null; p.anim = 'charge'; p.charging = clamp(this.seqT / 0.6, 0, 1) * 0.6; p.animT = this.seqT;
    } else {
      p.move = null; p.moveT = 0; p.anim = 'idle'; p.animT = t; p.muzzleT = 0; p.charging = 0;
    }
    const shakeX = this.shakeT > 0 ? Math.sin(t * 90) * 6 * this.shakeT * (this.game.settings?.screenShake ?? 1) : 0; // '화면 흔들림' 설정을 따른다 (끔이면 흔들지 않음)
    ctx.save();
    ctx.translate(fx + shakeX, fy);
    ctx.scale(sc, sc);
    p.cx = 0; p.bottom = 0;
    try {
      if (c.open) drawHero(ctx, p, null, {});
      else drawHero(ctx, p, null, { tint: '#050206' });
    } catch (e) { if (!this.drawErr) { this.drawErr = true; console.warn('[charselect] 미리보기', e); } }
    ctx.restore();
    // 참격 궤적 (근접 무기)
    if (step.mv && step.mv.slash && this.seqT >= step.mv.hit[0] && this.seqT <= step.mv.hit[1] + 0.08) {
      const s = step.mv.slash, k = clamp((this.seqT - step.mv.hit[0]) / (step.mv.hit[1] - step.mv.hit[0] + 0.08), 0, 1);
      ctx.save();
      ctx.translate(fx, fy - 50 * sc); ctx.scale(sc, sc);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = s.color ?? '#fff2d0'; ctx.lineWidth = (s.width ?? 16) * (1 - k * 0.6);
      const a0 = (s.angle ?? 0) - (s.arc ?? 2) / 2 * (s.dir ?? 1), a1 = a0 + (s.arc ?? 2) * (s.dir ?? 1) * ease.outCubic(k);
      ctx.beginPath(); ctx.arc(8, 0, s.r ?? 70, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      ctx.restore();
    }
    if (!c.open) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3);
      ctx.drawImage(glowSprite('#ff2040'), fx - 70, fy - 200, 140, 200); ctx.restore();
    }
  }

  drawTile(ctx, r, it, s, cur) {
    const t = this.game.time, acc = ACCENT[it.id] ?? GOLD;
    ctx.save();
    if (s > 0.05) { ctx.shadowColor = acc; ctx.shadowBlur = 16 * s; ctx.fillStyle = '#000'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.shadowBlur = 0; }
    portraitIn(ctx, assets.get(it.ch.portrait), r, { zoom: 1.6, fy: 0.12, silhouette: !it.open, fallback: it.ch.look.primary });
    if (!cur) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(r.x, r.y, r.w, r.h); }
    ctx.strokeStyle = cur ? acc : 'rgba(200,160,90,0.45)'; ctx.lineWidth = cur ? 2.5 : 1.2;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (!it.open) {
      // 자물쇠
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 4;
      ctx.strokeStyle = '#c8a8a0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy - 7, 6, Math.PI, TAU); ctx.stroke();
      ctx.fillStyle = '#8a6a5a'; ctx.fillRect(cx - 9, cy - 7, 18, 14);
      ctx.fillStyle = '#1a0a0a'; ctx.fillRect(cx - 1.5, cy - 3, 3, 6);
    }
    if (cur) {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 5);
      ctx.fillStyle = acc; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - 6, r.y + r.h + 6); ctx.lineTo(r.x + r.w / 2 + 6, r.y + r.h + 6); ctx.lineTo(r.x + r.w / 2, r.y + r.h + 12); ctx.fill();
    }
    ctx.restore();
  }
}
