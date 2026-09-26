// 타이틀: 클링 키 아트 켄번스 + 번개·박쥐·안개·불씨, 고딕 로고, PRESS START → 메인 메뉴, 어트랙트 화면, 코나미 커맨드
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { saves } from '../core/save.js';
import { text, FONT, ListMenu } from '../core/ui.js';
import { clamp, ease, lerp, TAU, fmt, rand } from '../core/math.js';
import { CHARACTERS, CHAR_ORDER } from '../data/characters.js';
import {
  Ambience, kenBurns, shade, menuItem, ornament, setPad, applySettings, installRecordScore,
  GOLD, BONE, DIM, CRIMSON, follow, MODE_NAME,
} from './front/common.js';

const KONAMI = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'attack', 'jump'];
const WATCH = ['up', 'down', 'left', 'right', 'attack', 'jump', 'confirm', 'cancel', 'menu', 'dash', 'sub'];

const ATTRACT_STORY = [
  '백 년에 한 번, 핏빛 달이 떠오르는 밤.',
  '안개 너머로 악마성 녹턴이 다시 모습을 드러냈다.',
  '불타는 마을, 사라진 아이들, 깨어나는 백작.',
  '사냥꾼이여 — 채찍을 들어라.',
];
const TIPS = [
  '부서지는 벽 속에는 전설의 비전서가 잠들어 있다.',
  '↓↘→ + 공격 — 비전서로 익힌 커맨드 기술을 써 보자.',
  '콤보를 길게 이을수록 점수 배율과 스타일 랭크가 오른다.',
  '30,000점마다 목숨이 하나씩 늘어난다. 1UP을 노려라!',
  '드라큘라의 유물 다섯 개… 모두 모으면 무슨 일이 일어날까?',
  '보조무기는 하트를 소모한다. 촛불을 부숴 하트를 모으자.',
];

// 로고 캐시 (한 번만 그림)
let LOGO = null, LOGO_FONT_OK = false;
function buildLogo() {
  const S = 2, W = 980, H = 250;
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const x = c.getContext('2d');
  x.scale(S, S);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const cx = W / 2, by = 128;
  const draw = (str, y, size, family, weight, grad, stroke, ls) => {
    x.font = `${weight} ${size}px ${family}`;
    try { x.letterSpacing = ls; } catch { /* 미지원 */ }
    // 외곽 발광
    x.save(); x.shadowColor = 'rgba(200,16,40,0.95)'; x.shadowBlur = 34; x.lineJoin = 'round';
    x.lineWidth = stroke + 6; x.strokeStyle = 'rgba(40,0,8,0.9)'; x.strokeText(str, cx, y); x.restore();
    x.lineJoin = 'round'; x.lineWidth = stroke; x.strokeStyle = '#1a0206'; x.strokeText(str, cx, y);
    x.lineWidth = stroke * 0.35; x.strokeStyle = '#6a1a10'; x.strokeText(str, cx, y + 1);
    x.fillStyle = grad; x.fillText(str, cx, y);
    // 윗면 하이라이트
    x.save(); x.globalCompositeOperation = 'source-atop';
    const hl = x.createLinearGradient(0, y - size * 0.8, 0, y - size * 0.35);
    hl.addColorStop(0, 'rgba(255,255,240,0.55)'); hl.addColorStop(1, 'rgba(255,255,240,0)');
    x.fillStyle = hl; x.fillRect(0, y - size, W, size * 0.7); x.restore();
  };
  const g = x.createLinearGradient(0, by - 82, 0, by + 6);
  g.addColorStop(0, '#fff6d8'); g.addColorStop(0.28, '#f2d488'); g.addColorStop(0.55, '#c8963a'); g.addColorStop(0.78, '#8a4a18'); g.addColorStop(1, '#c01830');
  draw('BLOOD NOCTURNE', by, 84, '"Cinzel Decorative", "Cinzel", serif', 900, g, 7, '2px');
  // 한글 부제
  const g2 = x.createLinearGradient(0, by + 30, 0, by + 64);
  g2.addColorStop(0, '#ffffff'); g2.addColorStop(1, '#d8c8b0');
  x.font = `800 30px "Nanum Myeongjo", "Noto Serif KR", serif`;
  try { x.letterSpacing = '6px'; } catch { /* 미지원 */ }
  x.lineJoin = 'round'; x.lineWidth = 6; x.strokeStyle = 'rgba(12,2,6,0.95)';
  x.strokeText('블러드 녹턴 : 악마성 연대기', cx, by + 62);
  x.fillStyle = g2; x.fillText('블러드 녹턴 : 악마성 연대기', cx, by + 62);
  try { x.letterSpacing = '0px'; } catch { /* 미지원 */ }
  // 장식선
  const lg = x.createLinearGradient(cx - 330, 0, cx + 330, 0);
  lg.addColorStop(0, 'rgba(232,200,114,0)'); lg.addColorStop(0.5, '#e8c872'); lg.addColorStop(1, 'rgba(232,200,114,0)');
  x.fillStyle = lg; x.fillRect(cx - 330, by + 18, 660, 2);
  x.fillRect(cx - 200, by + 80, 400, 1.5);
  x.save(); x.translate(cx, by + 19); x.rotate(Math.PI / 4); x.fillStyle = '#1a0206'; x.fillRect(-7, -7, 14, 14);
  x.strokeStyle = '#e8c872'; x.lineWidth = 2; x.strokeRect(-7, -7, 14, 14); x.fillStyle = '#c0102a'; x.fillRect(-3.5, -3.5, 7, 7); x.restore();
  // 위쪽 십자 장식
  x.save(); x.translate(cx, by - 104);
  x.fillStyle = '#1a0206'; x.fillRect(-4, -18, 8, 36); x.fillRect(-13, -9, 26, 8);
  x.fillStyle = '#e8c872'; x.fillRect(-2, -16, 4, 32); x.fillRect(-11, -7, 22, 4);
  x.restore();
  LOGO = { c, W, H, S };
  // 마스크 (광택 스윕용)
  LOGO.shine = document.createElement('canvas');
  LOGO.shine.width = c.width; LOGO.shine.height = c.height;
}
function fontsReady() {
  try { return document.fonts.check('900 40px "Cinzel Decorative"') && document.fonts.check('800 20px "Nanum Myeongjo"'); } catch { return true; }
}

export class TitleScene extends Scene {
  enter(params = {}) {
    const g = this.game;
    setPad(false);
    applySettings(g);
    installRecordScore(g);
    audio.music('title');
    this.amb = new Ambience({ embers: 70, motes: 24, bats: 14 });
    this.amb.nextBolt = 0.9;
    this.mode = params.menu ? 'menu' : 'intro';
    this.modeT = params.menu ? 1 : 0;
    this.idle = 0;
    this.konami = 0;
    this.px = 0; this.py = 0;
    this.drips = Array.from({ length: 6 }, (_, i) => ({ x: [-300, -190, -40, 70, 170, 285][i] + rand(-12, 12), t: rand(0, 4), len: rand(10, 22), sp: rand(0.18, 0.32) }));
    this.buildMenu(params.index ?? null);
    this.menuK = params.menu ? 1 : 0;
    this.selY = 0;
    this.sweep = -1; this.nextSweep = 2.2;
    if (!LOGO || !LOGO_FONT_OK) { LOGO_FONT_OK = fontsReady(); buildLogo(); }
  }
  exit() {}
  buildMenu(index) {
    const hasSave = saves.list().some((s) => !s.empty);
    this.items = [
      { id: 'new', label: '새 게임', sub: 'NEW GAME' },
      { id: 'continue', label: '이어하기', sub: 'CONTINUE', disabled: !hasSave },
      { id: 'arcade', label: '아케이드 모드', sub: 'ARCADE MODE' },
      { id: 'hof', label: '명예의 전당', sub: 'HALL OF FAME' },
      { id: 'options', label: '설정', sub: 'OPTIONS' },
      { id: 'credits', label: '크레딧', sub: 'CREDITS' },
    ];
    this.menu = new ListMenu(this.items.length, { index: index ?? (hasSave ? 1 : 0) });
  }
  onResume() { setPad(false); applySettings(this.game); this.buildMenu(this.menu.index); }

  // ── 입력 ──
  checkKonami() {
    for (const a of WATCH) {
      if (!input.pressed(a)) continue;
      if (a === 'confirm' || a === 'cancel' || a === 'menu') {
        // confirm/cancel 은 jump/attack 과 같은 키에서 동시에 발생 → 무시
        if (input.pressed('jump') || input.pressed('attack')) continue;
      }
      if (a === KONAMI[this.konami]) this.konami++;
      else this.konami = a === KONAMI[0] ? 1 : 0;
      if (this.konami === KONAMI.length) { this.konami = 0; return true; }
    }
    return false;
  }
  unlockAll() {
    const g = this.game, m = g.meta;
    const already = CHAR_ORDER.every((id) => m.unlockedChars.includes(id)) && m.konami;
    m.unlockedChars = [...new Set([...m.unlockedChars, ...CHAR_ORDER])];
    m.konami = true;
    saves.saveMeta(m);
    audio.sfx('secret'); audio.sfx('extra_life');
    g.flash('#ffe8a0', 0.8, 2.5);
    this.amb.strike(g.viewW, g.viewH, g.viewW / 2);
    g.toast(already ? '비밀 코드는 이미 발동되어 있습니다' : '★ 비밀 코드 발동! 모든 헌터가 해금되었습니다 ★', '#ffe070', 3.2);
    this.konamiT = 2.5;
  }

  update(dt) {
    const g = this.game, vw = g.viewW, vh = g.viewH;
    this.amb.update(dt, vw, vh);
    this.modeT += dt;
    if (this.konamiT > 0) this.konamiT -= dt;
    // 마우스 시차
    const p = input.pointer;
    const tx = p.active && !input.touchMode ? (p.x / vw - 0.5) * -18 : 0, ty = p.active && !input.touchMode ? (p.y / vh - 0.5) * -10 : 0;
    this.px = follow(this.px, tx, dt, 2.5); this.py = follow(this.py, ty, dt, 2.5);
    // 로고 광택
    this.nextSweep -= dt;
    if (this.nextSweep <= 0) { this.sweep = 0; this.nextSweep = rand(5, 8); }
    if (this.sweep >= 0) { this.sweep += dt / 1.1; if (this.sweep > 1) this.sweep = -1; }
    for (const d of this.drips) { d.t += dt * d.sp; if (d.t > 1.6) { d.t = 0; d.len = rand(10, 22); d.sp = rand(0.18, 0.32); } }
    this.menuK = follow(this.menuK, this.mode === 'menu' ? 1 : 0, dt, 7);
    if (this.checkKonami()) { this.unlockAll(); return; }

    if (input.anyPressed() || input.pointer.justDown) this.idle = 0; else this.idle += dt;

    if (this.mode === 'intro') {
      if (this.modeT > 2.2 || (this.modeT > 0.3 && (input.pressed('confirm') || input.pressed('menu') || input.pointer.tapped))) { this.mode = 'press'; this.modeT = 0; }
      return;
    }
    if (this.mode === 'press') {
      if (input.pressed('confirm') || input.pressed('menu') || input.pointer.tapped) {
        audio.sfx('menu_ok'); audio.sfx('whip_crack', { vol: 0.6 });
        g.flash('#ffffff', 0.25, 5);
        this.mode = 'menu'; this.modeT = 0; this.idle = 0;
        this.buildMenu(this.menu.index);
      }
      return;
    }
    // 메뉴
    if (this.idle > 40) { this.mode = 'press'; this.modeT = 0; this.idle = 0; return; }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    if (r === 'cancel') { audio.sfx('menu_cancel'); this.mode = 'press'; this.modeT = 0; return; }
    if (r === 'confirm') this.choose(this.items[this.menu.index]);
  }
  choose(it) {
    const g = this.game;
    if (it.disabled) { audio.sfx('menu_cancel'); g.toast('저장된 기록이 없습니다', '#ff9a9a'); return; }
    audio.sfx('menu_ok');
    switch (it.id) {
      case 'new': g.go('slots', { mode: 'new' }); break;
      case 'continue': g.go('slots', { mode: 'load' }); break;
      case 'arcade': g.go('arcade', {}); break;
      case 'hof': g.go('highscore', { back: 'title' }); break;
      case 'options': g.push('options', {}); break;
      case 'credits': g.go('credits', { back: 'title' }); break;
    }
  }

  // ── 그리기 ──
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const T = this.mode === 'intro' ? this.modeT : 99;
    const img = assets.get('bg/title');
    // 배경 켄번스 (초점: 달·성 중앙 상단)
    kenBurns(ctx, img, vw, vh, t, { z0: 1.03, z1: 1.1, period: 50, panX: 0.012, panY: 0.01, px: this.px, py: this.py, oy: 0.4 });
    this.amb.draw(ctx, vw, vh, 'back', t, this.px * 2);
    // 달빛 맥동
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createRadialGradient(vw * 0.5 + this.px, vh * 0.26, 20, vw * 0.5 + this.px, vh * 0.26, vh * 0.5);
    mg.addColorStop(0, `rgba(255,60,50,${0.1 + 0.05 * Math.sin(t * 0.9)})`); mg.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = mg; ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
    shade(ctx, vw, vh, { top: 0.35, bottom: 0.8, vig: 0.75 });
    this.amb.draw(ctx, vw, vh, 'front', t, this.px * 3);
    // 메뉴 쪽 어둡게
    const mk = this.menuK;
    if (mk > 0.01) {
      const lg = ctx.createLinearGradient(0, 0, vw * 0.55, 0);
      lg.addColorStop(0, `rgba(4,1,6,${0.86 * mk})`); lg.addColorStop(0.6, `rgba(4,1,6,${0.45 * mk})`); lg.addColorStop(1, 'rgba(4,1,6,0)');
      ctx.fillStyle = lg; ctx.fillRect(0, 0, vw * 0.55, vh);
    }
    // 인트로 암전
    if (T < 1.2) { ctx.fillStyle = `rgba(0,0,0,${1 - ease.inOutQuad(clamp(T / 1.2, 0, 1))})`; ctx.fillRect(0, 0, vw, vh); }

    this.drawLogo(ctx, vw, vh, t, T, mk);
    if (this.mode === 'press' || this.mode === 'intro') this.drawPress(ctx, vw, vh, t, T);
    if (mk > 0.02) this.drawMenu(ctx, vw, vh, t, mk);
    // 상단 우측: 최고 점수 (아케이드 감성)
    const hi = this.game.meta?.highScores?.[0];
    const a = clamp((T - 1.5) / 0.6, 0, 1);
    if (a > 0) {
      ctx.save(); ctx.globalAlpha = a;
      text(ctx, 'HI-SCORE', vw - 16, 24, { size: 11, align: 'right', weight: 800, family: FONT.num, color: '#ff5a6a', ow: 3 });
      text(ctx, fmt(hi?.score ?? 0).padStart(9, ' '), vw - 16, 46, { size: 20, align: 'right', weight: 900, family: FONT.num, color: '#fff', ow: 4 });
      if (hi) text(ctx, `${hi.name || CHARACTERS[hi.charId]?.name?.split(' ')[0] || '???'} · ${MODE_NAME[hi.mode || 'story'] ?? ''}`, vw - 16, 62, { size: 11, align: 'right', weight: 700, color: DIM, ow: 2 });
      text(ctx, '© 2026 BLOOD NOCTURNE PROJECT', vw - 14, vh - 12, { size: 10, align: 'right', weight: 700, family: FONT.num, color: 'rgba(200,180,160,0.55)', ow: 2 });
      if (this.game.meta?.konami) text(ctx, '✦ 비밀 코드 적용됨', 14, vh - 12, { size: 10, weight: 700, color: 'rgba(255,224,112,0.7)', ow: 2 });
      ctx.restore();
    }
    if (this.konamiT > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(this.konamiT / 2.5, 0, 1) * 0.35;
      const kg = ctx.createRadialGradient(vw / 2, vh / 2, 10, vw / 2, vh / 2, vw * 0.6);
      kg.addColorStop(0, '#ffe8a0'); kg.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = kg; ctx.fillRect(0, 0, vw, vh); ctx.restore();
    }
  }

  drawLogo(ctx, vw, vh, t, T, mk) {
    if (!LOGO) return;
    if (!LOGO_FONT_OK && fontsReady()) { LOGO_FONT_OK = true; buildLogo(); }
    const reveal = ease.outCubic(clamp((T - 0.5) / 1.1, 0, 1));
    if (reveal <= 0) return;
    // 위치: 기본은 중앙 상단, 메뉴가 열리면 좌상단으로 이동·축소
    const bx = vw / 2, by = vh * 0.3;
    const mx = Math.min(250, vw * 0.27), my = 92;
    const cx = lerp(bx, mx, mk), cy = lerp(by, my, mk);
    const sc = lerp(Math.min(1, (vw - 40) / LOGO.W), 0.5, mk) * lerp(1.12, 1, reveal);
    const w = LOGO.W * sc, h = LOGO.H * sc;
    const x0 = cx - w / 2, y0 = cy - h * 0.52 + Math.sin(t * 0.8) * 2 * (1 - mk);
    ctx.save();
    // 뒤쪽 어둠 (가독성)
    ctx.globalAlpha = reveal * 0.75;
    const dg = ctx.createRadialGradient(cx, cy, 10, cx, cy, w * 0.55);
    dg.addColorStop(0, 'rgba(0,0,0,0.55)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = dg; ctx.fillRect(cx - w * 0.6, cy - h * 0.8, w * 1.2, h * 1.6);
    ctx.globalAlpha = reveal;
    ctx.drawImage(LOGO.c, x0, y0, w, h);
    // 광택 스윕
    if (this.sweep >= 0) {
      const s = LOGO.shine, sx = s.getContext('2d');
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      sx.clearRect(0, 0, s.width, s.height);
      sx.drawImage(LOGO.c, 0, 0);
      sx.globalCompositeOperation = 'source-in';
      const p = lerp(-0.2, 1.2, ease.inOutQuad(this.sweep)) * s.width;
      const sg = sx.createLinearGradient(p - 160, 0, p + 160, s.height * 0.3);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,250,230,0.85)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      sx.fillStyle = sg; sx.fillRect(0, 0, s.width, s.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(s, x0, y0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 핏방울 (로고 아래로 흘러내림)
    if (mk < 0.95) {
      const k = sc;
      ctx.fillStyle = '#9a0a1e';
      for (const d of this.drips) {
        const u = clamp(d.t, 0, 1.6);
        const baseX = cx + d.x * k, baseY = y0 + 132 * sc;
        const grow = clamp(u / 0.8, 0, 1), fall = clamp((u - 0.8) / 0.8, 0, 1);
        const L = d.len * grow * sc;
        ctx.globalAlpha = reveal * (1 - mk) * (1 - fall);
        ctx.beginPath();
        ctx.moveTo(baseX - 3 * sc, baseY); ctx.quadraticCurveTo(baseX, baseY + L * 1.4, baseX + 3 * sc, baseY); ctx.fill();
        if (fall > 0) { ctx.beginPath(); ctx.ellipse(baseX, baseY + L + fall * 90 * sc, 2.4 * sc, 3.6 * sc, 0, 0, TAU); ctx.fill(); }
      }
    }
    ctx.restore();
  }

  drawPress(ctx, vw, vh, t, T) {
    const A = this.mode === 'press' ? clamp(this.modeT / 0.5, 0, 1) : clamp((T - 1.7) / 0.5, 0, 1);
    if (A <= 0) return;
    const blink = 0.55 + 0.45 * Math.sin(t * 4.2);
    ctx.save();
    ctx.globalAlpha = A * blink;
    ctx.shadowColor = '#ff2a40'; ctx.shadowBlur = 16;
    text(ctx, 'PRESS START', vw / 2, vh * 0.8, { size: 30, align: 'center', weight: 900, family: FONT.logo, color: '#fff4dc', ow: 5, outline: 'rgba(30,0,6,0.95)' });
    ctx.shadowBlur = 0;
    ctx.globalAlpha = A * 0.85;
    text(ctx, input.touchMode ? '— 화면을 터치하세요 —' : '— Enter 또는 Z 키를 누르세요 —', vw / 2, vh * 0.8 + 26, { size: 14, align: 'center', weight: 700, color: '#d8c8b0', ow: 3 });
    ctx.restore();
    // 어트랙트 (방치 시)
    if (this.mode === 'press' && this.idle > 10) this.drawAttract(ctx, vw, vh, t, this.idle - 10);
  }

  drawAttract(ctx, vw, vh, t, it) {
    const cyc = 9, n = 3, idx = Math.floor(it / cyc) % n, u = (it % cyc) / cyc;
    const a = clamp(Math.min(u * 6, (1 - u) * 6), 0, 1);
    const y = vh * 0.52, w = Math.min(560, vw - 80), x = vw / 2 - w / 2;
    ctx.save();
    ctx.globalAlpha = a;
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, 'rgba(0,0,0,0)'); bg.addColorStop(0.2, 'rgba(6,2,8,0.72)'); bg.addColorStop(0.8, 'rgba(6,2,8,0.72)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(x - 40, y - 30, w + 80, 150);
    if (idx === 0) {
      ATTRACT_STORY.forEach((s, i) => {
        const k = clamp(u * 5 - i * 0.7, 0, 1);
        ctx.globalAlpha = a * k;
        text(ctx, s, vw / 2, y + i * 30, { size: i === 3 ? 20 : 17, align: 'center', weight: 800, family: FONT.title, color: i === 3 ? '#ffd890' : '#e8dccb', ow: 3 });
      });
    } else if (idx === 1) {
      text(ctx, 'HALL OF FAME', vw / 2, y - 6, { size: 18, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      const hs = (this.game.meta?.highScores ?? []).slice(0, 4);
      if (!hs.length) text(ctx, '아직 기록이 없습니다. 첫 번째 전설이 되어라!', vw / 2, y + 40, { size: 15, align: 'center', color: BONE });
      hs.forEach((h, i) => {
        const yy = y + 26 + i * 24;
        text(ctx, `${i + 1}${['ST', 'ND', 'RD', 'TH'][Math.min(i, 3)]}`, x + 70, yy, { size: 14, weight: 900, family: FONT.num, color: i === 0 ? '#ffe070' : BONE });
        text(ctx, h.name || CHARACTERS[h.charId]?.name?.split(' ')[0] || '???', x + 130, yy, { size: 14, weight: 800, color: '#fff' });
        text(ctx, MODE_NAME[h.mode || 'story'] ?? '', x + 260, yy, { size: 12, color: DIM });
        text(ctx, fmt(h.score), x + w - 70, yy, { size: 15, align: 'right', weight: 900, family: FONT.num, color: '#fff' });
      });
    } else {
      const tip = TIPS[Math.floor(it / (cyc * n)) % TIPS.length];
      text(ctx, 'HUNTER\'S TIP', vw / 2, y, { size: 16, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 4 });
      ornament(ctx, vw / 2, y + 14, 260, { alpha: a });
      text(ctx, tip, vw / 2, y + 52, { size: 17, align: 'center', weight: 700, color: '#f0e4d0', ow: 3 });
    }
    ctx.restore();
  }

  drawMenu(ctx, vw, vh, t, mk) {
    const x = 36, w = Math.min(330, vw * 0.36), h = 50, y0 = 186;
    this.menu.clearHits();
    this.items.forEach((it, i) => {
      const k = ease.outCubic(clamp(mk * 1.6 - i * 0.1, 0, 1));
      if (k <= 0) return;
      const r = { x: x - (1 - k) * 60, y: y0 + i * (h + 4), w, h };
      this.menu.hit(i, r);
      ctx.save(); ctx.globalAlpha = k;
      menuItem(ctx, r, it.label, { selected: this.menu.index === i && this.mode === 'menu', disabled: it.disabled, sub: it.sub, k });
      ctx.restore();
    });
    ctx.save(); ctx.globalAlpha = mk;
    const ver = saves.list().filter((s) => !s.empty).length;
    text(ctx, input.touchMode ? '항목을 터치하세요' : '↑↓ 선택   Z/Enter 결정   X 뒤로', x + 8, vh - 16, { size: 12, weight: 700, color: '#a89888', ow: 2 });
    if (ver) text(ctx, `저장된 기록 ${ver}개`, x + 8, y0 - 14, { size: 11, weight: 700, color: DIM, ow: 2 });
    ctx.restore();
  }
}
