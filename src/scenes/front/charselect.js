// 캐릭터 선택: 클링 초상화 + 실시간 drawHero 미리보기(대기·연속 공격 루프), 이름/칭호/설명/능력치 별점/무기,
// 잠긴 캐릭터는 실루엣 + 해금 조건. 스토리: 새 세이브 생성 → 프롤로그 / 아케이드: 임시 세이브로 모드 시작
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, lerp, TAU } from '../../core/math.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { MOVESETS } from '../../data/movesets.js';
import { getDiff } from '../../data/difficulty.js';
import { newGameState } from '../../game/state.js';
import { drawHero } from '../../render/hero.js';
import {
  Ambience, kenBurns, shade, frame, ornament, portraitIn, gbutton, backButton, footer, setPad, stars, puppet,
  glowSprite, follow, GOLD, BONE, DIM, CRIMSON,
} from './common.js';
import { startArcade, ARCADE_MODES } from './arcade.js';

const WNAME = { whip: '채찍', sword: '장검', greatsword: '대검', dagger: '쌍단검', gun: '쌍권총', staff: '지팡이·성서' };
const DNAME = { dash: '돌진 대시', mist: '안개 변신', roll: '구르기', blink: '순간이동' };
const ACCENT = { kael: '#e8c872', sera: '#fff2b0', victor: '#ffb060', bran: '#8ab0ff', lia: '#ff4a6a', azel: '#ff2a4a' };

export class CharSelectScene extends Scene {
  enter({ slot = 1, difficulty = 'normal', mode = 'story', arcade = null } = {}) {
    setPad(false);
    this.slot = slot; this.difficulty = difficulty; this.mode = mode; this.arcade = arcade;
    const m = this.game.meta;
    const unlocked = (id) => !CHARACTERS[id].unlock || m?.unlockedChars?.includes(id);
    this.list = CHAR_ORDER.map((id) => ({ id, ch: CHARACTERS[id], open: unlocked(id), pup: puppet(id) }));
    const last = m?.lastChar && this.list.findIndex((c) => c.id === m.lastChar && c.open);
    this.menu = new ListMenu(this.list.length, { cols: this.list.length, index: last > 0 ? last : 0 });
    this.amb = new Ambience({ embers: 50, motes: 20, bats: 3, lightning: false });
    this.changeT = 0; this.prev = -1; this.cur = this.menu.index;
    this.seqT = 0; this.seq = null; this.buildSeq();
    this.pick = null; this.pickT = 0;
    this.selK = this.list.map((_, i) => (i === this.cur ? 1 : 0));
    for (const c of this.list) assets.get(c.ch.portrait);
  }
  onResume() { setPad(false); }
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
    this.amb.update(dt, g.viewW, g.viewH);
    this.changeT += dt;
    this.selK = this.selK.map((v, i) => follow(v, i === this.menu.index ? 1 : 0, dt, 14));
    // 미리보기 동작 순서
    this.seqT += dt;
    const step = this.seq[this.seqI];
    const len = step.idle ?? (step.mv.dur + 0.06);
    if (this.seqT >= len) { this.seqT = 0; this.seqI = (this.seqI + 1) % this.seq.length; }
    if (this.pick) {
      this.pickT += dt;
      if (this.pickT > 1.25 && !this.went) { this.went = true; this.start(); }
      return;
    }
    if (this.backTapped) { this.backTapped = false; this.leave(); return; }
    if (this.startTapped) { this.startTapped = false; this.choose(); return; }
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
    g.go('story', { script: 'prologue', then: 'hub', thenParams: { from: 'prologue' }, bg: 'cg/cg_prologue_moon', title: { eng: 'PROLOGUE', kor: '프롤로그 — 핏빛 달이 뜨는 밤' }, music: 'prologue' }, { fadeTime: 0.8 });
  }
  leave() {
    audio.sfx('menu_cancel');
    if (this.mode === 'arcade') this.game.go('arcade', { cfg: this.arcade });
    else this.game.go('difficulty', { slot: this.slot, index: ['easy', 'normal', 'hard', 'nightmare', 'inferno'].indexOf(this.difficulty) });
  }

  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const c = this.sel, ch = c.ch, acc = ACCENT[c.id] ?? GOLD;
    const ck = ease.outCubic(clamp(this.changeT / 0.4, 0, 1));
    kenBurns(ctx, assets.get('bg/s03_gate'), vw, vh, t, { z0: 1.05, z1: 1.12, period: 64 });
    ctx.fillStyle = 'rgba(6,2,10,0.7)'; ctx.fillRect(0, 0, vw, vh);
    // 캐릭터 색 광원
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(vw * 0.24, vh * 0.55, 10, vw * 0.24, vh * 0.55, vh * 0.8);
    gg.addColorStop(0, rgba(acc, c.open ? 0.2 : 0.06)); gg.addColorStop(1, rgba(acc, 0));
    ctx.fillStyle = gg; ctx.fillRect(0, 0, vw, vh); ctx.restore();
    this.amb.draw(ctx, vw, vh, 'back', t);

    // ── 초상화 (좌측 절반) ──
    const pw = vw * 0.5;
    const img = assets.get(ch.portrait);
    const slide = (1 - ck) * -60;
    const pr = { x: slide, y: 0, w: pw + 20, h: vh };
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.75 * ck;
    portraitIn(ctx, img, pr, { fy: 0.12, zoom: 1.02 + 0.015 * Math.sin(t * 0.4), silhouette: !c.open, fallback: ch.look.primary });
    // 오른쪽/아래 페이드
    const fr = ctx.createLinearGradient(pw * 0.55, 0, pw + 20, 0);
    fr.addColorStop(0, 'rgba(6,2,10,0)'); fr.addColorStop(1, 'rgba(6,2,10,1)');
    ctx.fillStyle = fr; ctx.fillRect(pw * 0.55, 0, pw * 0.45 + 22, vh);
    const fb = ctx.createLinearGradient(0, vh * 0.55, 0, vh);
    fb.addColorStop(0, 'rgba(6,2,10,0)'); fb.addColorStop(1, 'rgba(6,2,10,0.92)');
    ctx.fillStyle = fb; ctx.fillRect(0, vh * 0.55, pw + 22, vh * 0.45);
    ctx.restore();
    if (!c.open) {
      text(ctx, '?', pw * 0.42, vh * 0.42, { size: 150, align: 'center', weight: 900, family: FONT.logo, color: 'rgba(179,18,46,0.35)', ow: 0 });
    }
    // ── 미리보기 (받침 마법진 + drawHero) ──
    this.drawPreview(ctx, vw * 0.22, vh - 62, c, acc, t);
    shade(ctx, vw, vh, { top: 0.4, bottom: 0.2, vig: 0.6 });
    this.amb.draw(ctx, vw, vh, 'front', t);

    // ── 정보 패널 (우측) ──
    const ix = pw + 10, iw = vw - ix - 24;
    const ia = ck;
    text(ctx, this.mode === 'arcade' ? `ARCADE · ${ARCADE_MODES[this.arcade?.kind]?.name ?? ''}` : 'SELECT YOUR HUNTER', ix, 40, { size: 14, weight: 900, family: FONT.logo, color: '#c8a8a0', ow: 3 });
    const dd = getDiff(this.difficulty);
    text(ctx, dd.name, vw - 24, 40, { size: 13, align: 'right', weight: 800, color: dd.color, ow: 3 });
    ctx.save();
    ctx.globalAlpha = ia; ctx.translate((1 - ia) * 40, 0);
    text(ctx, c.open ? ch.eng : '? ? ?', ix, 82, { size: 15, weight: 900, family: FONT.logo, color: acc, ow: 3 });
    ctx.shadowColor = rgba(acc, 0.6); ctx.shadowBlur = 16;
    text(ctx, c.open ? ch.name : '잠긴 헌터', ix, 122, { size: 36, weight: 800, family: FONT.title, color: '#fff4e4', ow: 5 });
    ctx.shadowBlur = 0;
    text(ctx, c.open ? ch.title : 'LOCKED', ix + 2, 148, { size: 16, weight: 800, color: c.open ? '#ff8a8a' : '#8a6a6a', ow: 3 });
    ornament(ctx, ix + iw / 2, 164, iw, { color: acc, alpha: 0.9 });
    const desc = c.open ? ch.desc : `${ch.unlock?.text ?? '특정 조건을 만족하면 합류합니다.'}\n악마성 어딘가에서 이 헌터가 당신을 기다리고 있다.`;
    wrap(ctx, desc, iw, 14, 500).slice(0, 4).forEach((l, i) => text(ctx, l, ix, 192 + i * 22, { size: 14, color: c.open ? '#e8dccb' : '#b89a9a', ow: 2 }));
    // 능력치
    const sy = 290;
    const entries = Object.entries(ch.stars ?? {});
    entries.forEach(([k, v], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = ix + col * (iw / 2), y = sy + row * 24;
      text(ctx, k, x, y + 5, { size: 13, weight: 700, color: DIM, ow: 2 });
      stars(ctx, x + 52, y, c.open ? v : 0, 5, { color: acc, size: 14 });
    });
    const wy = sy + Math.ceil(entries.length / 2) * 24 + 8;
    if (c.open) {
      text(ctx, `무기  ${WNAME[ch.weaponType] ?? ch.weaponType}    이동  ${DNAME[ch.move?.dash] ?? '대시'}${ch.move?.airJumps > 1 ? ` · ${ch.move.airJumps + 1}단 점프` : ''}`, ix, wy, { size: 13, weight: 700, color: BONE, ow: 2 });
      text(ctx, `필살기  「${ch.ult?.name ?? '???'}」`, ix, wy + 20, { size: 13, weight: 800, color: ch.ult?.color ?? GOLD, ow: 2 });
    }
    ctx.restore();

    // ── 로스터 타일 ──
    const n = this.list.length, ts = Math.min(64, (iw - 5 * 8) / n), gap = 8;
    const tx0 = ix, ty = vh - 132;
    this.menu.clearHits();
    this.list.forEach((it, i) => {
      const s = this.selK[i];
      const r = { x: tx0 + i * (ts + gap), y: ty - s * 6, w: ts, h: ts };
      if (!this.pick) this.menu.hit(i, { x: r.x - 2, y: ty - 8, w: ts + 4, h: ts + 12 });
      this.drawTile(ctx, r, it, s, i === this.menu.index);
    });
    // 시작 버튼
    const br = { x: ix, y: vh - 58, w: Math.min(250, iw * 0.6), h: 46 };
    if (gbutton(ctx, br, c.open ? (this.mode === 'arcade' ? '이 헌터로 도전' : '이 헌터로 출발') : '잠겨 있음', { selected: c.open, disabled: !c.open, accent: acc, size: 16 })) this.startTapped = true;
    text(ctx, input.touchMode ? '초상화를 터치해 선택' : '←→ 선택  Z 결정  X 뒤로', br.x + br.w + 14, vh - 29, { size: 12, weight: 700, color: '#a89888', ow: 2 });
    if (backButton(ctx)) this.backTapped = true;

    // 선택 확정 연출
    if (this.pick) {
      const k = clamp(this.pickT / 1.25, 0, 1);
      const bandK = ease.outExpo(clamp(this.pickT / 0.25, 0, 1));
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * bandK})`; ctx.fillRect(0, 0, vw, vh);
      const by = vh * 0.5 - 50, bh = 100;
      ctx.beginPath(); ctx.moveTo(0, by + 14); ctx.lineTo(vw, by); ctx.lineTo(vw, by + bh - 14); ctx.lineTo(0, by + bh); ctx.closePath();
      ctx.fillStyle = rgba(this.pick.ch.ult?.color ?? acc, 0.22 * bandK); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 14; i++) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(((i * 131 + this.pickT * 2600) % (vw + 300)) - 150, by + 10 + (i * 29) % (bh - 20), 180, 2); }
      ctx.globalCompositeOperation = 'source-over';
      text(ctx, this.pick.ch.name, vw * 0.5 + (1 - bandK) * 400, by + 60, { size: 42, align: 'center', weight: 900, family: FONT.title, color: '#fff4e0', ow: 6 });
      text(ctx, `— ${this.pick.ch.title} —`, vw * 0.5 - (1 - bandK) * 400, by + 86, { size: 15, align: 'center', weight: 800, color: this.pick.ch.ult?.color ?? acc, ow: 3 });
      if (k > 0.75) { ctx.fillStyle = `rgba(0,0,0,${(k - 0.75) * 4})`; ctx.fillRect(0, 0, vw, vh); }
      ctx.restore();
    }
  }

  drawPreview(ctx, fx, fy, c, acc, t) {
    const p = c.pup;
    const step = this.seq[this.seqI];
    // 받침 마법진
    ctx.save();
    ctx.translate(fx, fy);
    ctx.scale(1, 0.28);
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
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.fillStyle = rgba(acc, 0.9); ctx.fillRect(Math.cos(a) * 92 - 2, Math.sin(a) * 92 - 2, 4, 4); }
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
    const sc = Math.min(2.25, this.game.viewH / 240);
    const shakeX = this.shakeT > 0 ? Math.sin(t * 90) * 6 * this.shakeT : 0;
    if (this.shakeT > 0) this.shakeT -= 1 / 60;
    ctx.save();
    ctx.translate(fx + shakeX, fy);
    ctx.scale(sc, sc);
    p.cx = 0; p.bottom = 0;
    try {
      if (c.open) drawHero(ctx, p, null, {});
      else drawHero(ctx, p, null, { tint: '#050206' });
    } catch (e) { /* 렌더러 교체 중일 수 있음 */ }
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
