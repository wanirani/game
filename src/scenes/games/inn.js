// 흑묘 여관 — 미니게임 홀. 마르타(주인)의 입담, 게임 5종 카드 메뉴, 규칙/배당/기록, 판돈 선택(무료 한 판),
// 방문 전적, 그림 속 검은 고양이 '까망이' 이스터에그(탭하면 깨어나 행운을 물어다 줌)
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { text, FONT, wrap } from '../../core/ui.js';
import { clamp, rand, ease, fmt, TAU } from '../../core/math.js';
import { Particles } from '../../core/particles.js';
import { drawIcon } from '../../render/icons.js';
import {
  GAMES, GAME_ORDER, BETS, session, newVisit, ensureState, autosave, line, reactTo, grantItems, itemIcon,
  Hits, gPanel, drawBtn, goldText, goldPlaque, Roller, bubble, bubbleText, padPush, padPop, padHide, vignetteSoft, affordableBet, GOLD,
} from './common.js';
import { rr, glow, drawChip, drawEmblem, heartPath } from './art.js';

// 그림(bg/inn) 속 고양이 위치 (이미지 비율 좌표)
const CAT = { x0: 0.735, x1: 0.945, y0: 0.745, y1: 0.915, hx: 0.772, hy: 0.797 };
const BG_OY = 0.75;

export class InnScene extends Scene {
  enter() {
    const st = ensureState(this.game);
    newVisit();
    this.hits = new Hits();
    this.fx = new Particles(260);
    this.goldR = new Roller(st.gold);
    this.sel = Math.max(0, GAME_ORDER.indexOf(session.lastGame));
    this.betV = affordableBet(st.gold, session.lastBet ?? 100);
    this.free = false;
    this.mood = 'idle'; this.moodT = 0; this.emoteT = 0;
    this.say(st.gold < BETS[0] ? line('poor') : line('greet', null, st), 'happy');
    this.cat = { awake: 0, taps: 0, zT: 0, hearts: [] };
    this.cardT = GAME_ORDER.map(() => 0);
    this.leaving = false;
    this.bgImg = null;
    this.motes = Array.from({ length: 22 }, () => ({ x: Math.random(), y: Math.random(), v: rand(0.006, 0.02), ph: rand(0, TAU), s: rand(0.6, 1.4) }));
    audio.music('inn');
    padPush();
    assets.preload(['bg/inn', 'portraits/npc_marta']);
  }
  exit() { padPop(); }
  onResume() {
    padHide();
    audio.music('inn');
    this.leaving = false;
    const st = this.game.state;
    const rec = session.last;
    if (rec && rec !== this.lastSeen) {
      this.lastSeen = rec;
      const r = rec.line ? { text: rec.line, mood: rec.mood } : reactTo(rec, st);
      this.say(r.text, r.mood);
      if (rec.win && !rec.free) this.fx.burst('gold', 130, 470, 18, { speed: 160 });
    }
    this.betV = affordableBet(st.gold, session.lastBet ?? this.betV);
  }
  say(str, mood = 'idle') {
    this.line = str; this.sayT = 0; this.mood = mood; this.moodT = 0;
    if (mood !== 'idle') this.emoteT = 0;
  }

  get gameId() { return GAME_ORDER[this.sel]; }
  betOptions() { return session.freeUsed ? BETS : [0, ...BETS]; }
  get betValue() { return this.free ? 0 : this.betV; }
  setBet(v) {
    const st = this.game.state;
    if (v === 0) { if (session.freeUsed) return; this.free = true; this.say(line('free'), 'happy'); }
    else if (st.gold < v) { this.say(line('poor'), 'sad'); audio.sfx('menu_cancel'); return; }
    else { this.free = false; this.betV = v; session.lastBet = v; }
    audio.sfx('menu_move');
  }
  cycleBet(d) {
    const opts = this.betOptions(), st = this.game.state;
    let i = opts.indexOf(this.betValue);
    for (let k = 0; k < opts.length; k++) {
      i = clamp(i + d, 0, opts.length - 1);
      if (opts[i] === 0 || st.gold >= opts[i]) { if (opts[i] !== this.betValue) this.setBet(opts[i]); return; }
    }
  }
  select(i) {
    i = (i + GAME_ORDER.length) % GAME_ORDER.length;
    if (i === this.sel) return;
    this.sel = i; session.lastGame = this.gameId;
    audio.sfx('card', { vol: 0.6 });
    this.say(line('pick', this.gameId), 'idle');
  }
  start() {
    const st = this.game.state, g = GAMES[this.gameId];
    if (!this.free && st.gold < this.betV) { this.say(line('poor'), 'sad'); audio.sfx('menu_cancel'); return; }
    if (!this.game.registry[g.scene]) { this.game.toast('준비 중인 게임이에요.', '#e8c872'); return; }
    audio.sfx('menu_ok');
    session.lastGame = this.gameId;
    const params = { bet: this.betV, free: this.free && !session.freeUsed, fromInn: true };
    this.free = false;
    this.leaving = true;
    this.game.fadeOut(() => { this.leaving = false; this.game.push(g.scene, params); }, 0.3);
  }
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    audio.sfx('menu_cancel');
    this.say(line('leave'), 'happy');
    autosave(this.game);
    const g = this.game;
    if (g.scenes.length > 1) g.fadeOut(() => g.pop({ from: 'inn' }), 0.4);
    else g.go(g.registry.hub ? 'hub' : 'title', { from: 'inn' });
  }

  // ── 고양이 ──
  catRect() {
    const img = this.bgImg;
    if (!img) return null;
    const vw = this.game.viewW, vh = this.game.viewH;
    const s = Math.max(vw / img.width, vh / img.height);
    const dw = img.width * s, dh = img.height * s, ox = (vw - dw) / 2, oy = (vh - dh) * BG_OY;
    return { x: ox + CAT.x0 * dw, y: oy + CAT.y0 * dh, w: (CAT.x1 - CAT.x0) * dw, h: (CAT.y1 - CAT.y0) * dh, hx: ox + CAT.hx * dw, hy: oy + CAT.hy * dh, k: s };
  }
  petCat() {
    const st = this.game.state, c = this.cat;
    c.taps++; session.catTaps++;
    c.awake = 1.8;
    const r = this.catRect();
    if (r) {
      for (let i = 0; i < 5; i++) c.hearts.push({ x: r.hx + rand(-6, 30), y: r.hy - 4, vx: rand(-20, 70), vy: rand(-110, -60), t: 0, life: rand(1.1, 1.6), s: rand(7, 11) });
      this.fx.text(r.hx, r.hy - 26, '냐옹~', { color: '#ffe7a0', size: 18, vy: -60, font: `800 18px ${FONT.body}` });
    }
    audio.sfx('menu_ok', { pitch: 1.7, vol: 0.7 });
    if (session.catTaps === 1) {
      session.catLuck = 0.5;
      this.say(line('catLuck'), 'wow');
      this.game.toast('흑묘의 가호 — 다음 승리 시 드롭 확률 +50%', '#c8a0ff');
      audio.sfx('secret');
    } else if (session.catTaps === 9) {
      if (!st.innGames.catGift) {
        st.innGames.catGift = true;
        const got = grantItems(st, ['m_stone_2']);
        if (got.length) this.game.toast(`까망이의 선물: ${got[0].name} ×1`, '#ffe070');
        else { st.gold += 99; this.game.toast('까망이의 선물: 99 G', '#ffe070'); }
        this.say(line('cat9'), 'wow');
        audio.sfx('extra_life');
        if (r) this.fx.burst('holy', r.hx, r.hy, 24, { speed: 180 });
        autosave(this.game);
      } else this.say('까망이가 졸린가 봐요. 이제 그만 재워 줘요~', 'idle');
    } else if (session.catTaps % 3 === 0 || this.sayT > 2.5) this.say(line('cat'), 'happy');
  }

  update(dt) {
    const st = this.game.state;
    this.goldR.update(dt, st.gold);
    this.fx.update(dt);
    this.sayT += dt; this.moodT += dt; this.emoteT += dt;
    for (const m of this.motes) { m.y -= m.v * dt; m.ph += dt; if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); } }
    for (let i = 0; i < 5; i++) this.cardT[i] += ((i === this.sel ? 1 : 0) - this.cardT[i]) * Math.min(1, dt * 10);
    const c = this.cat;
    c.awake = Math.max(0, c.awake - dt);
    c.zT += dt;
    for (let i = c.hearts.length - 1; i >= 0; i--) { const h = c.hearts[i]; h.t += dt; h.x += h.vx * dt; h.y += h.vy * dt; h.vy -= 10 * dt; if (h.t > h.life) c.hearts.splice(i, 1); }
    if (this.leaving) return;
    if (session.freeUsed && this.free) this.free = false;
    const tap = this.hits.tapped();
    if (tap === 'back' || (input.pressed('cancel') && !input.pressed('confirm'))) { this.leave(); return; }
    if (tap?.startsWith('game:')) { const i = +tap.slice(5); if (i === this.sel) this.start(); else this.select(i); return; }
    if (tap?.startsWith('bet:')) { this.setBet(+tap.slice(4)); return; }
    if (tap === 'start') { this.start(); return; }
    if (tap === 'marta') { this.say(line('pick', this.gameId), 'happy'); audio.sfx('menu_move'); return; }
    if (tap === 'cat') { this.petCat(); return; }
    if (input.pressed('left')) this.select(this.sel - 1);
    if (input.pressed('right')) this.select(this.sel + 1);
    if (input.pressed('up')) this.cycleBet(1);
    if (input.pressed('down')) this.cycleBet(-1);
    if (input.pressed('confirm')) this.start();
  }

  render(ctx) {
    this.hits.clear();
    const g = this.game, vw = g.viewW, vh = g.viewH, t = this.t, st = g.state;
    // 배경
    const img = assets.get('bg/inn');
    this.bgImg = img;
    if (img) {
      const s = Math.max(vw / img.width, vh / img.height);
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (vw - dw) / 2, (vh - dh) * BG_OY, dw, dh);
    } else { ctx.fillStyle = '#12080c'; ctx.fillRect(0, 0, vw, vh); }
    const fl = 0.85 + 0.1 * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 12.7);
    ctx.fillStyle = 'rgba(8,3,10,0.28)'; ctx.fillRect(0, 0, vw, vh);
    glow(ctx, vw * 0.42, vh * 0.56, vh * 0.55, '#ff8a3a', 0.16 * fl);
    vignetteSoft(ctx, vw, vh, 0.7);
    const tg = ctx.createLinearGradient(0, 0, 0, 70);
    tg.addColorStop(0, 'rgba(4,1,6,0.85)'); tg.addColorStop(1, 'rgba(4,1,6,0)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, vw, 70);
    for (const m of this.motes) glow(ctx, (m.x + Math.sin(m.ph * 0.5) * 0.01) * vw, m.y * vh, 5 * m.s, '#ffc070', 0.25 + 0.2 * Math.sin(m.ph * 3));
    this.drawCat(ctx);

    // 상단
    const back = this.hits.rect('back', 12, 10, 110, 40);
    this.hits.add('back', back);
    drawBtn(ctx, back, '◀ 나가기', { tone: 'dark', size: 16, hot: this.hits.over(back), pressed: this.hits.pressed(back), key: 'X' });
    goldText(ctx, '흑묘 여관', 140, 40, 30, { align: 'left', glowCol: '#ff4060' });
    text(ctx, 'BLACK CAT INN · 미니게임 홀', 142, 56, { size: 11, weight: 700, family: FONT.num, color: '#b89a70', ow: 2 });
    goldPlaque(ctx, vw - 196, 10, 184, this.goldR.value, t, this.goldR.flash);

    // 레이아웃
    const LW = clamp(Math.round(vw * 0.23), 220, 280);
    const RX = 16 + LW + 14, RW = vw - 16 - RX;
    this.drawMarta(ctx, 16, 64, LW, 236);
    this.drawBubble(ctx, 16, 312, LW, 104);
    this.drawSummary(ctx, 16, 426, LW, 102);
    this.drawCards(ctx, RX, 66, RW, 170);
    this.drawDetail(ctx, RX, 246, RW, 152);
    this.drawBetRow(ctx, RX, 408, RW, 120);
    this.fx.draw(ctx, 'front');
    this.fx.draw(ctx, 'top');
  }

  drawCat(ctx) {
    const r = this.catRect();
    if (!r) return;
    this.hits.add('cat', this.hits.rect('cat', r.x, r.y, r.w, r.h));
    const c = this.cat, t = this.t;
    if (c.awake > 0) {
      const a = clamp(c.awake / 0.3, 0, 1) * clamp((1.8 - c.awake) / 0.12, 0, 1);
      const ex = r.hx, ey = r.hy, sp = 8.5 * r.k * 1.9;
      for (const s of [-1, 1]) {
        const x = ex + s * sp * 0.5 - sp * 0.1, y = ey + s * 1;
        glow(ctx, x, y, 14 * r.k * 2, '#b8ff60', 0.7 * a);
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = '#d8ff70'; ctx.beginPath(); ctx.ellipse(x, y, 4.4 * r.k * 1.9, 3.2 * r.k * 1.9, s * 0.2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0a0806'; ctx.fillRect(x - 0.9, y - 3 * r.k * 1.9, 1.8, 6 * r.k * 1.9);
        ctx.restore();
      }
    } else {
      // 잠든 고양이의 Zzz
      const u = (c.zT % 2.4) / 2.4;
      for (let i = 0; i < 3; i++) {
        const k = (u + i / 3) % 1;
        ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
        text(ctx, 'z', r.hx - 6 + k * 18 + Math.sin(k * 6) * 4, r.hy - 18 - k * 34, { size: 10 + k * 8, weight: 800, family: FONT.num, color: '#e8dcff', ow: 2 });
      }
      ctx.globalAlpha = 1;
      // 탭 유도 반짝임 (가끔)
      if (session.catTaps === 0 && Math.sin(t * 1.3) > 0.92) glow(ctx, r.hx, r.hy, 26, '#fff2b0', 0.4);
    }
    for (const h of c.hearts) {
      const a = 1 - h.t / h.life;
      ctx.save(); ctx.translate(h.x, h.y); ctx.globalAlpha = a;
      glow(ctx, 0, 0, h.s * 2, '#ff6a9a', 0.5);
      heartPath(ctx, h.s * 1.8); ctx.fillStyle = '#ff5a8a'; ctx.fill();
      ctx.restore();
    }
  }

  drawMarta(ctx, x, y, w, h) {
    const img = assets.get('portraits/npc_marta'), t = this.t;
    const hit = this.hits.rect('marta', x, y, w, h);
    this.hits.add('marta', hit);
    // 반응 애니메이션
    const mt = this.moodT;
    let dy = 0, dx = 0, sc = 1;
    if (this.mood === 'happy' || this.mood === 'wow') { const k = Math.max(0, 1 - mt / 0.6); dy = -Math.abs(Math.sin(mt * 14)) * 7 * k; sc = 1 + 0.03 * k; }
    else if (this.mood === 'sad') { const k = Math.max(0, 1 - mt / 0.5); dx = Math.sin(mt * 30) * 3 * k; }
    const arch = (inset) => {
      const ax = x + inset, ay = y + inset, aw = w - inset * 2, ah = h - inset * 2, rad = aw / 2;
      ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + rad * 0.62);
      ctx.quadraticCurveTo(ax, ay, ax + rad, ay); ctx.quadraticCurveTo(ax + aw, ay, ax + aw, ay + rad * 0.62);
      ctx.lineTo(ax + aw, ay + ah); ctx.closePath();
    };
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.translate(3, 6); arch(0); ctx.fill(); ctx.translate(-3, -6);
    // 나무 액자
    const wg = ctx.createLinearGradient(x, y, x + w, y + h);
    wg.addColorStop(0, '#5a3a20'); wg.addColorStop(0.5, '#2a160a'); wg.addColorStop(1, '#140a04');
    arch(0); ctx.fillStyle = wg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0a0402'; ctx.stroke();
    arch(6); ctx.strokeStyle = GOLD; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); arch(9); ctx.clip();
    ctx.fillStyle = '#140a10'; ctx.fillRect(x, y, w, h);
    if (img) {
      const iw = w - 18, ih = h - 18;
      const s = Math.max(iw / img.width, ih / (img.height * 0.9)) * sc;
      const dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, x + 9 + (iw - dw) / 2 + dx, y + 9 - dh * 0.02 + dy, dw, dh);
    }
    // 촛불빛 일렁임 + 아래 그늘
    glow(ctx, x + w * 0.85, y + h * 0.85, w * 0.7, '#ff9a3a', 0.12 + 0.05 * Math.sin(t * 8));
    const sh = ctx.createLinearGradient(0, y + h * 0.6, 0, y + h);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = sh; ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
    ctx.restore();
    // 이름패
    const nw = 132, nx = x + w / 2 - nw / 2, ny = y + h - 20;
    gPanel(ctx, nx, ny, nw, 30, { a: 0.95, r: 6, orn: false, edge: GOLD });
    text(ctx, '마르타', nx + nw / 2, ny + 17, { size: 15, align: 'center', weight: 800, family: FONT.title, color: '#ffe7a0', ow: 3 });
    text(ctx, '여관 주인', nx + nw / 2, ny + 28, { size: 9, align: 'center', weight: 700, color: '#b89a70', ow: 2 });
    // 감정 표시
    if (this.mood !== 'idle' && this.emoteT < 2.2) {
      const k = ease.outBack(clamp(this.emoteT / 0.3, 0, 1)) * clamp((2.2 - this.emoteT) / 0.3, 0, 1);
      const ex = x + w - 30, ey = y + 34 - Math.sin(this.emoteT * 4) * 3;
      ctx.save(); ctx.translate(ex, ey); ctx.scale(k, k);
      const sym = this.mood === 'happy' ? '♪' : this.mood === 'wow' ? '!!' : '…';
      const col = this.mood === 'sad' ? '#9ab0ff' : this.mood === 'wow' ? '#ffe070' : '#ff9ac0';
      ctx.fillStyle = 'rgba(20,8,16,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, sym, 0, 7, { size: 19, align: 'center', weight: 900, color: col, ow: 2 });
      ctx.restore();
    }
    ctx.restore();
  }

  drawBubble(ctx, x, y, w, h) {
    bubble(ctx, x, y, w, h, 'up', x + w * 0.86, y - 12);
    const n = Math.floor(this.sayT * 38);
    const prev = Math.floor((this.sayT - 1 / 60) * 38);
    if (n !== prev && n % 3 === 0 && n < (this.line?.length ?? 0)) audio.sfx('type', { vol: 0.12 });
    bubbleText(ctx, this.line ?? '', x + 14, y + 26, w - 28, 14.5, n, 4);
  }

  drawSummary(ctx, x, y, w, h) {
    gPanel(ctx, x, y, w, h, { a: 0.8 });
    text(ctx, '오늘의 전적', x + 14, y + 24, { size: 14, weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    text(ctx, `${session.games}판 · ${session.wins}승`, x + w - 14, y + 24, { size: 13, align: 'right', weight: 700, color: '#e8dcc8', ow: 2 });
    const net = session.net;
    text(ctx, '수익', x + 14, y + 50, { size: 13, weight: 700, color: '#b8a888', ow: 2 });
    text(ctx, `${net > 0 ? '+' : ''}${fmt(net)} G`, x + w - 14, y + 51, { size: 18, align: 'right', weight: 900, family: FONT.num, color: net > 0 ? '#9af09a' : net < 0 ? '#ff8a8a' : '#e8dcc8', ow: 3 });
    const ids = Object.keys(session.drops);
    if (!ids.length) {
      text(ctx, session.catLuck ? '흑묘의 가호가 함께합니다' : '획득한 전리품 없음', x + 14, y + 80, { size: 12, weight: 600, color: session.catLuck ? '#c8a0ff' : '#7a6a5a', ow: 2 });
    } else {
      ids.slice(0, 6).forEach((id, i) => {
        const ix = x + 26 + i * 34, iy = y + 78;
        drawIcon(ctx, itemIcon(id), ix, iy, 30);
        text(ctx, '×' + session.drops[id], ix + 14, iy + 14, { size: 11, align: 'right', weight: 800, color: '#fff', ow: 3 });
      });
    }
  }

  drawCards(ctx, x, y, w, h) {
    const n = GAME_ORDER.length, gap = 12;
    const cw = Math.min(170, (w - gap * (n - 1)) / n);
    const x0 = x + (w - (cw * n + gap * (n - 1))) / 2;
    GAME_ORDER.forEach((id, i) => {
      const k = this.cardT[i], G = GAMES[id];
      const cx = x0 + i * (cw + gap), cy = y + 8 - k * 8;
      const r = this.hits.rect('game:' + i, cx, cy, cw, h - 8);
      this.hits.add('game:' + i, r);
      const hov = this.hits.over(r);
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; rr(ctx, cx + 2, cy + 6, cw, h - 8, 12); ctx.fill();
      if (k > 0.05) { ctx.save(); ctx.shadowColor = G.accent; ctx.shadowBlur = 22 * k; rr(ctx, cx, cy, cw, h - 8, 12); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore(); }
      const bg = ctx.createLinearGradient(0, cy, 0, cy + h);
      bg.addColorStop(0, k > 0.5 ? '#3a1424' : '#22101c'); bg.addColorStop(1, '#0a0408');
      rr(ctx, cx, cy, cw, h - 8, 12); ctx.fillStyle = bg; ctx.fill();
      ctx.lineWidth = 1.5 + k; ctx.strokeStyle = k > 0.5 ? '#ffe7a0' : hov ? '#c8a050' : '#6a5030'; ctx.stroke();
      rr(ctx, cx + 5, cy + 5, cw - 10, h - 18, 8); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(232,200,114,${0.15 + k * 0.25})`; ctx.stroke();
      // 문장
      ctx.save(); rr(ctx, cx + 5, cy + 5, cw - 10, h - 18, 8); ctx.clip();
      glow(ctx, cx + cw / 2, cy + 64, cw * 0.7, G.accent, 0.12 + k * 0.18);
      drawEmblem(ctx, id, cx + cw / 2, cy + 64, Math.min(cw * 0.78, 110), this.t + i, k);
      ctx.restore();
      goldText(ctx, G.name, cx + cw / 2, cy + h - 42, cw > 140 ? 19 : 17, { ow: 4, glowCol: k > 0.5 ? G.accent : null });
      text(ctx, G.sub, cx + cw / 2, cy + h - 24, { size: 11, align: 'center', weight: 700, color: '#b8a080', ow: 2 });
      ctx.restore();
    });
  }

  drawDetail(ctx, x, y, w, h) {
    const id = this.gameId, G = GAMES[id], st = this.game.state;
    gPanel(ctx, x, y, w, h, { a: 0.84, glowCol: 'rgba(179,18,46,0.35)' });
    const pw = Math.min(250, w * 0.36);
    const lx = x + 18, lw = w - pw - 40;
    goldText(ctx, G.name, lx, y + 32, 22, { align: 'left', glowCol: G.accent });
    ctx.font = `800 22px ${FONT.title}`;
    const nw = ctx.measureText(G.name).width;
    text(ctx, G.sub, lx + nw + 10, y + 31, { size: 12, weight: 700, color: '#b8a080', ow: 2 });
    const lines = wrap(ctx, G.rules, lw, 13.5, 500);
    lines.slice(0, 5).forEach((l, i) => text(ctx, l, lx, y + 56 + i * 19.5, { size: 13.5, weight: 500, color: '#e8dcc8', ow: 2 }));
    // 배당 상자
    const bx = x + w - pw - 14, by = y + 14, bh = h - 28;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; rr(ctx, bx, by, pw, bh, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(232,200,114,0.35)'; ctx.lineWidth = 1; ctx.stroke();
    text(ctx, '배당', bx + 12, by + 20, { size: 12, weight: 800, color: GOLD, ow: 2 });
    G.pays.forEach((p, i) => text(ctx, p, bx + 12, by + 42 + i * 19, { size: 12.5, weight: 700, color: '#f0e4c8', ow: 2, maxWidth: pw - 20 }));
    text(ctx, recordText(id, st), bx + 12, by + bh - 10, { size: 11.5, weight: 700, color: '#9ad0ff', ow: 2, maxWidth: pw - 20 });
    if (!input.touchMode) text(ctx, '← → 게임 선택 · ↑ ↓ 판돈 · Z 시작 · X 나가기', lx, y + h - 10, { size: 11, weight: 600, color: '#8a7a68', ow: 2 });
  }

  drawBetRow(ctx, x, y, w, h) {
    const st = this.game.state;
    // 오른쪽 아래 고양이 영역은 비워 둔다
    const cr = this.catRect();
    const right = cr ? Math.min(x + w, cr.x - 8) : x + w;
    const avail = right - x;
    const bw = clamp(avail * 0.3, 128, 170), bh = 62;
    const chipsW = avail - bw - 16;
    const opts = this.betOptions();
    const r = clamp(chipsW / opts.length / 2 - 7, 20, 28);
    const gapC = Math.min(r * 2 + 16, chipsW / opts.length);
    const cy = y + 60;
    gPanel(ctx, x, y, avail, h, { a: 0.78, r: 12 });
    text(ctx, '판돈', x + 16, y + 22, { size: 13, weight: 800, family: FONT.title, color: GOLD, ow: 3 });
    text(ctx, this.free ? '무료 한 판 — 이겨도 보상은 없어요' : session.freeUsed ? '' : '무료 한 판을 즐길 수 있어요!', x + 56, y + 22, { size: 11.5, weight: 700, color: '#7affd8', ow: 2 });
    const x0 = x + 14 + gapC / 2;
    opts.forEach((v, i) => {
      const px = x0 + i * gapC;
      const hr = this.hits.rect('bet:' + v, px - gapC / 2, cy - r - 8, gapC, r * 2 + 18);
      this.hits.add('bet:' + v, hr);
      drawChip(ctx, px, cy, r, v, { selected: this.betValue === v, disabled: v > 0 && st.gold < v, t: this.t });
      if (v === 0) text(ctx, '1회', px, cy + r + 14, { size: 10, align: 'center', weight: 700, color: '#7affd8', ow: 2 });
    });
    const sr = this.hits.rect('start', right - bw - 12, y + (h - bh) / 2 + 6, bw, bh);
    const can = this.free || st.gold >= this.betV;
    this.hits.add('start', sr);
    drawBtn(ctx, sr, '도전하기!', { tone: 'crimson', size: 20, hot: this.hits.over(sr) || can, pressed: this.hits.pressed(sr), sub: this.free ? '무료 한 판' : `${fmt(this.betV)} G 걸기`, key: 'Z', disabled: !can, pulse: can, t: this.t });
  }
}

function recordText(id, st) {
  const b = st.innGames?.best ?? {};
  switch (id) {
    case 'dice': return b.diceStreak ? `최고 연승 ${b.diceStreak}회 · 최고 ×${b.diceMult ?? 1}` : '아직 기록이 없어요';
    case 'blackjack': return b.bjWins ? `승리 ${b.bjWins}회 · 블랙잭 ${b.bjBlackjacks ?? 0}회` : '아직 기록이 없어요';
    case 'slot': return b.slotBest ? `최고 당첨 ${fmt(b.slotBest)} G · 잭팟 ${b.slotJackpots ?? 0}회` : '아직 기록이 없어요';
    case 'duel': return `격파 ${st.innGames?.duelRank ?? 0}/5${b.duelReact ? ` · 최고 반응 ${b.duelReact.toFixed(3)}초` : ''}`;
    case 'memory': return b.memTime ? `최단 ${b.memTime.toFixed(1)}초 · 최소 ${b.memMoves ?? '-'}수` : '아직 기록이 없어요';
  }
  return '';
}
