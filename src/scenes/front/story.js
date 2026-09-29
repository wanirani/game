// 시네마틱 컷신: 레터박스 + 배경/CG 켄번스 패닝·크로스페이드 + 초상화 + 타자기 대사 + 선택지 + 명령(cmd)
// go('story', { script, then, thenParams, bg, title:{eng,kor}, music })
//  · SCRIPTS[script] 가 없으면 곧바로 then 으로 이동
//  · 건너뛰기(메뉴/취소/SKIP 버튼) → 확인 후 다음 선택지 또는 끝까지 명령만 실행하며 빨리 감기
//  · 추가 명령: {cmd:'cg', id|null} {cmd:'bg', id} {cmd:'wait', time} {cmd:'title', text, sub} {cmd:'flash', color}
//               {cmd:'recruit', id} — 2부 동료 합류 (world2 §2.4): flags['recruit_'+id] = true + game.companions?.recruit?.(id)
//               (건너뛰기도 다른 명령처럼 실행한다. 합류 연출은 마을의 companionJoin 이 맡는다)
//  · 장면 플래그: uiScale (platform §6.2 — game.uiW × game.uiH 로 배치), hidePad, deferToasts
//  · 줄 단위 덮어쓰기: { name } 명패, { portrait } 초상화, { side } 좌우
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { bus } from '../../core/events.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, lerp } from '../../core/math.js';
import { SCRIPTS } from '../../data/story.js';
import { CHARACTERS } from '../../data/characters.js';
import { NPCS } from '../../data/npcs.js';
import { BOSSES } from '../../data/bosses.js';
import { grantItem } from '../../game/inventory.js';
import { drawHints } from '../../core/prompts.js';
import { Ambience, kenBurns, ornament, gbutton, menuItem, goSafe, glowSprite, featherPortrait, TapZones, GOLD, BONE, DIM } from './common.js';

const BAR = 50;
/** 버튼 최소 높이 (platform §6.3: 44 CSS px) → 이 장면 좌표(px) */
function tapMin(g, sc) {
  const k = (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1);
  return Math.max(44, Math.ceil(44 / Math.max(0.2, k)));
}

function speaker(who, state) {
  if (!who || who === 'narrator') return { name: '', portrait: null, side: 'center' };
  if (who === 'hero') who = state?.charId ?? 'kael';
  if (CHARACTERS[who]) return { name: CHARACTERS[who].name, portrait: CHARACTERS[who].portrait, side: 'left', color: '#ffe7a0' };
  if (NPCS[who]) return { name: NPCS[who].name, portrait: NPCS[who].portrait ?? `portraits/${who}`, side: 'right', color: '#f3d690' };
  if (BOSSES[who]) return { name: BOSSES[who].name, portrait: BOSSES[who].portrait ?? `portraits/${who}`, side: 'right', color: '#ff8a8a' };
  return { name: who, portrait: assets.has(`portraits/${who}`) ? `portraits/${who}` : null, side: 'right', color: '#f3d690' };
}
const imgKey = (id) => (!id ? null : id.includes('/') ? id : id.startsWith('cg_') ? `cg/${id}` : id.startsWith('b_') || id.startsWith('npc_') ? `portraits/${id}` : `bg/${id}`);

export class StoryScene extends Scene {
  enter({ script = null, lines = null, then = 'hub', thenParams = {}, bg = null, title = null, music = null } = {}) {
    // 컷신 동안 토스트(결과 화면에서 미뤄진 퀘스트 알림 등)는 CG 위에 뜨지 않도록 숨기고, 다음 장면에서 이어서 보여 준다
    this.deferToasts = true;
    this.hidePad = true;   // 가상 패드 숨김 (game.syncPad 가 장면 플래그를 읽는다)
    this.uiScale = true;   // 휴대폰에서 글자·버튼을 키운다 (배치는 game.uiW × game.uiH)
    this.taps = new TapZones();
    this.script = script; this.then = then; this.thenParams = thenParams;
    this.layers = []; this.bars = 0;
    this.amb = new Ambience({ embers: 40, motes: 26, bats: 0, fog: true, lightning: false });
    this.port = { key: null, prev: null, t: 1, side: 'left' };
    const L = lines ?? (script ? SCRIPTS[script] : null);
    if (!L || !L.length) { this.lines = []; this.empty = true; this.finish(true); return; }
    this.lines = L;
    this.labels = {};
    // { label } 줄만 이동 목표. { if, cmd:'goto', label } (ifChar/ifFlag) 은 조건부 이동 명령이다
    L.forEach((l, k) => { if (l.label && !l.cmd) this.labels[l.label] = k; });
    const st = this.game.state;
    if (script && st?.progress && !st.progress.seenScripts.includes(script)) st.progress.seenScripts.push(script);
    this.setImage(imgKey(bg) ?? 'bg/title', true);
    this.base = imgKey(bg) ?? 'bg/title';
    this.cg = null;
    this.card = title ? { eng: title.eng ?? '', kor: title.kor ?? '', t: 0, dur: 3.2 } : null;
    this.i = -1; this.cur = null; this.full = ''; this.shown = 0; this.menu = null;
    this.waitT = 0; this.lineT = 0;
    if (music) audio.music(music);
    if (!this.card) this.next();
  }
  get state() { return this.game.state; }
  /** 배치 크기: uiScale 이면 UI 좌표 (game.render 가 ctx.scale(uiK) 로 감싼다) */
  dims() {
    const g = this.game;
    return this.uiScale && g.uiW ? [g.uiW, g.uiH] : [g.viewW, g.viewH];
  }
  setImage(key, instant = false) {
    if (!key) return;
    if (this.layers.length && this.layers[this.layers.length - 1].key === key) return;
    assets.get(key);
    this.layers.push({ key, t: instant ? 99 : 0, phase: Math.random() * 40, dir: this.layers.length % 2 ? 1 : -1 });
    if (this.layers.length > 3) this.layers.shift();
  }
  fill(s) { return String(s).replaceAll('{hero}', CHARACTERS[this.state?.charId]?.name ?? '헌터'); }
  resolveText(t) {
    if (typeof t === 'string') return this.fill(t);
    if (t && typeof t === 'object') return this.fill(t[this.state?.charId] ?? t.default ?? Object.values(t)[0] ?? '');
    return '';
  }
  check(cond) {
    const f = this.state?.progress?.flags ?? {};
    if (typeof cond === 'string') return cond.startsWith('!') ? !f[cond.slice(1)] : !!f[cond];
    if (cond?.char) return this.state?.charId === cond.char;
    return true;
  }
  runCmd(l, quiet = false) {
    const st = this.state, g = this.game;
    switch (l.cmd) {
      case 'give': if (st) { try { grantItem(st, l.item, l.qty ?? 1); } catch { /* 무시 */ } if (!quiet) { g.toast(`획득: ${l.name ?? l.item} ×${l.qty ?? 1}`, '#e8c872'); audio.sfx('item'); } } break;
      case 'gold': if (st) { st.gold = (st.gold ?? 0) + (l.amount ?? 0); if (!quiet) { g.toast(`${l.amount} G 획득`, '#ffd84a'); audio.sfx('coin'); } } break;
      case 'flag': if (st) st.progress.flags[l.key] = l.value ?? true; break;
      case 'quest': bus.emit('questOffer', { questId: l.id }); g.quests?.accept?.(l.id); break;
      case 'unlockChar': {
        const m = g.meta;
        if (m && !m.unlockedChars.includes(l.id)) { m.unlockedChars.push(l.id); saves.saveMeta(m); g.toast(`${CHARACTERS[l.id]?.name ?? l.id} 합류! (캐릭터 해금)`, '#ffe070'); audio.sfx('levelup'); }
        break;
      }
      case 'relic': if (st && !st.progress.relics.includes(l.id)) st.progress.relics.push(l.id); break;
      case 'recruit': // world2 §2.4 — 플래그가 합류의 원본, 동료 시스템이 없으면 플래그만 남는다
        if (st?.progress && l.id) {
          (st.progress.flags ??= {})['recruit_' + l.id] = true;
          try { g.companions?.recruit?.(l.id); } catch (e) { console.warn('[story] recruit', l.id, e); }
        }
        break;
      case 'shake': if (!quiet) { this.shakeT = l.time ?? 0.5; this.shakeP = (l.power ?? 8) * (g.settings?.screenShake ?? 1); g.flash(l.color ?? '#fff', 0.35); } break;
      case 'flash': if (!quiet) g.flash(l.color ?? '#fff', l.a ?? 0.7, l.decay ?? 3); break;
      case 'music': audio.music(l.id); break;
      case 'sfx': if (!quiet) audio.sfx(l.id); break;
      case 'goto': this.i = (this.labels[l.label] ?? this.lines.length) - 1; break;
      case 'cg': { const k = imgKey(l.id); this.cg = k; if (k) this.setImage(k); else this.setImage(this.baseKey()); break; }
      case 'bg': this.base = imgKey(l.id); if (!this.cg) this.setImage(this.base); break;
      case 'wait': if (!quiet) this.waitT = l.time ?? 1; break;
      case 'title': if (!quiet) this.card = { eng: l.text ?? '', kor: l.sub ?? '', t: 0, dur: l.time ?? 2.8 }; break;
    }
  }
  baseKey() { return this.base ?? this.layers[0]?.key ?? 'bg/title'; }
  /** 다음 표시할 대사로 */
  next() {
    while (true) {
      this.i++;
      if (this.i >= this.lines.length) { this.finish(); return; }
      const l = this.lines[this.i];
      if (l.label && !l.text && !l.cmd) continue;
      if (l.if && !this.check(l.if)) continue;
      if (l.cmd) {
        this.runCmd(l);
        if (this.waitT > 0 || this.card) return;
        continue;
      }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      this.show(l);
      return;
    }
  }
  show(l) {
    this.cur = l; this.lineT = 0;
    this.full = this.resolveText(l.text ?? '');
    this.shown = 0;
    this.menu = l.choice ? new ListMenu(l.choice.length) : null;
    const sp = speaker(l.who, this.state);
    // 줄 단위 덮어쓰기: 이름을 밝히기 전의 명패(name), 변신 등 다른 초상화(portrait)
    if (l.name) sp.name = this.fill(l.name);
    if (l.portrait) sp.portrait = l.portrait;
    this.sp = sp;
    const key = sp.portrait;
    if (key !== this.port.key) { this.port.prev = this.port.key; this.port.prevSide = this.port.side; this.port.key = key; this.port.t = 0; }
    this.port.side = l.side ?? sp.side;
    if (key) assets.get(key);
  }
  /** 빨리 감기: 선택지나 끝까지 명령만 실행 */
  skip() {
    audio.sfx('menu_ok');
    while (true) {
      this.i++;
      if (this.i >= this.lines.length) { this.finish(); return; }
      const l = this.lines[this.i];
      if (l.label && !l.text && !l.cmd) continue;
      if (l.if && !this.check(l.if)) continue;
      if (l.cmd) { if (l.cmd !== 'wait' && l.cmd !== 'title') this.runCmd(l, true); continue; }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      if (l.choice) { this.show(l); this.shown = this.full.length; this.card = null; this.waitT = 0; return; }
    }
  }
  finish(immediate = false) {
    if (this.ending) return;
    this.ending = true;
    const g = this.game, st = g.state;
    if (st && st.slot >= 1 && !st.arcade) { try { saves.write(st.slot, st); } catch { /* 무시 */ } }
    goSafe(g, this.then, this.thenParams, { fadeTime: immediate ? 0.25 : 0.9 });
  }
  update(dt) {
    const [vw, vh] = this.dims();
    this.amb.update(dt, vw, vh);
    for (const L of this.layers) L.t += dt;
    this.port.t += dt;
    this.bars = Math.min(1, this.bars + dt * 1.8);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.ending || this.empty) return;
    if (this.taps.hit() === 'skip') { this.askSkip(); return; }
    if (input.pressed('menu') && !input.pressed('confirm')) { this.askSkip(); return; }
    if (this.card) {
      this.card.t += dt;
      const adv = input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped;
      if (this.card.t > this.card.dur || (adv && this.card.t > 0.6)) { this.card = null; this.next(); }
      return;
    }
    if (this.waitT > 0) { this.waitT -= dt; if (this.waitT <= 0) this.next(); return; }
    if (!this.cur) return;
    this.lineT += dt;
    const adv = input.pressed('confirm') || input.pressed('attack') || input.pressed('jump') || input.pointer.tapped;
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      const fast = input.down('confirm') || input.down('attack');
      this.shown = Math.min(this.full.length, this.shown + (fast && this.lineT > 0.25 ? 120 : 38) * dt);
      const c = Math.floor(this.shown);
      if (c !== before && c % 3 === 0 && this.full[c] !== ' ') audio.sfx('type', { vol: 0.12 });
      if (adv && this.lineT > 0.12) this.shown = this.full.length;
      return;
    }
    if (this.menu) {
      const r = this.menu.update(dt);
      if (this.menu.moved) audio.sfx('menu_move');
      if (r === 'confirm') {
        const c = this.cur.choice[this.menu.index];
        audio.sfx('menu_ok');
        if (c.set && this.state) Object.assign(this.state.progress.flags, c.set);
        if (c.goto) this.i = (this.labels[c.goto] ?? this.lines.length) - 1;
        this.next();
      }
      return;
    }
    if (adv) { audio.sfx('menu_move', { vol: 0.35 }); this.next(); }
  }
  askSkip() {
    if (this.asking) return;
    this.asking = true;
    this.game.push('frontConfirm', {
      title: '이벤트 건너뛰기', message: this.lines.some((l, k) => k > this.i && l.choice) ? '다음 선택지까지 건너뛸까요?' : '이 이벤트를 건너뛸까요?', yes: '건너뛰기', no: '계속 보기',
      onYes: () => { this.asking = false; this.card = null; this.waitT = 0; this.skip(); }, onNo: () => { this.asking = false; },
    });
  }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, [vw, vh] = this.dims(), t = g.time;
    this.taps.clear();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    const sx = this.shakeT > 0 ? Math.sin(t * 70) * this.shakeP * clamp(this.shakeT * 2, 0, 1) : 0;
    ctx.save(); ctx.translate(sx, 0);
    // 배경 레이어 크로스페이드
    for (const L of this.layers) {
      const a = ease.inOutQuad(clamp(L.t / 1.1, 0, 1));
      if (a <= 0) continue;
      const img = assets.get(L.key);
      if (!img) continue;
      kenBurns(ctx, img, vw, vh, L.t + L.phase, { z0: 1.03, z1: 1.14, period: 70, panX: 0.025 * L.dir, panY: 0.012, alpha: a });
    }
    // 톤: 아래쪽 어둡게
    const tg = ctx.createLinearGradient(0, vh * 0.45, 0, vh);
    tg.addColorStop(0, 'rgba(0,0,0,0)'); tg.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = tg; ctx.fillRect(0, 0, vw, vh);
    this.amb.draw(ctx, vw, vh, 'front', t);
    ctx.restore();
    if (!this.empty) {
      this.drawPortrait(ctx, vw, vh, t);
      this.drawText(ctx, vw, vh, t);
    }
    // 레터박스
    const bh = BAR * ease.outCubic(this.bars);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, bh); ctx.fillRect(0, vh - bh, vw, bh);
    ctx.fillStyle = 'rgba(232,200,114,0.35)'; ctx.fillRect(0, bh, vw, 1); ctx.fillRect(0, vh - bh - 1, vw, 1);
    // 건너뛰기 (버튼은 44 CSS px 이상, 키보드·패드는 기기에 맞는 글리프 안내)
    if (!this.empty && !this.ending) {
      const bh = tapMin(g, this), bw = Math.max(116, bh * 2.4);
      const r = { x: vw - bw - 12, y: Math.max(1, (BAR - bh) / 2), w: bw, h: bh };
      gbutton(ctx, r, 'SKIP ▶▶', { size: 13, zones: this.taps, id: 'skip' });
      if (!input.touchMode) drawHints(ctx, [['menu', '건너뛰기']], r.x - 12, r.y + r.h / 2 + 5, { align: 'right', size: 12, color: '#8a7e74' });
    }
    // 타이틀 카드
    if (this.card) this.drawCard(ctx, vw, vh);
  }
  drawCard(ctx, vw, vh) {
    const c = this.card, k = clamp(Math.min(c.t / 0.8, (c.dur - c.t) / 0.6), 0, 1);
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = k;
    ctx.shadowColor = 'rgba(179,18,46,0.9)'; ctx.shadowBlur = 20;
    text(ctx, c.eng, vw / 2, vh / 2 - 4 - (1 - k) * 10, { size: 40, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 5 });
    ctx.shadowBlur = 0;
    ornament(ctx, vw / 2, vh / 2 + 14, 420 * ease.outCubic(k));
    text(ctx, c.kor, vw / 2, vh / 2 + 50, { size: 20, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
    ctx.restore();
  }
  drawPortrait(ctx, vw, vh, t) {
    const P = this.port;
    // 전체 화면 이벤트 CG 가 떠 있으면 CG 속 인물과 겹치지 않도록 초상화를 그리지 않는다 (명패·대사는 그대로, dialogue.js 와 같음)
    // CG 가 크로스페이드로 들어오는 동안에는 그만큼 초상화를 흐리게
    let hide = 0;
    if (this.cg && assets.get(this.cg)) {
      const L = this.layers.find((l) => l.key === this.cg);
      hide = L ? ease.inOutQuad(clamp(L.t / 1.1, 0, 1)) : 1;
    }
    if (hide >= 1) return;
    const draw = (key, side, a, slide) => {
      const img = key ? assets.get(key) : null;
      a *= 1 - hide;
      if (!img || a <= 0) return;
      const fp = featherPortrait(img, key);
      const h = (this.cg ? 0.84 : 0.94) * vh, w = h * img.width / img.height;
      const x = side === 'left' ? 10 - slide : vw - w - 10 + slide;
      const y = vh - h - BAR + 30 + Math.sin(t * 0.8) * 2;
      ctx.save();
      // 뒤쪽 어둠 + 은은한 역광 (배경과 분리)
      ctx.globalAlpha = a * 0.55;
      ctx.drawImage(glowSprite('#000000'), x - w * 0.1, y + h * 0.05, w * 1.2, h * 1.1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * 0.22;
      ctx.drawImage(glowSprite(side === 'left' ? '#6a8aff' : '#ff3a4a'), x - w * 0.15, y - h * 0.05, w * 1.3, h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = a;
      ctx.drawImage(fp ?? img, x, y, w, h);
      ctx.restore();
    };
    const k = ease.outCubic(clamp(P.t / 0.45, 0, 1));
    if (P.prev && k < 1) draw(P.prev, P.prevSide, 1 - k, k * 40);
    if (P.key) draw(P.key, P.side, k, (1 - k) * 60);
  }
  drawText(ctx, vw, vh, t) {
    const l = this.cur;
    if (!l || this.card || this.waitT > 0) return;
    const narr = !this.sp?.name;
    const shown = this.full.slice(0, Math.floor(this.shown));
    const bandH = 150, by = vh - BAR - bandH;
    const bg = ctx.createLinearGradient(0, by, 0, vh - BAR);
    bg.addColorStop(0, 'rgba(4,1,6,0)'); bg.addColorStop(0.35, 'rgba(4,1,6,0.72)'); bg.addColorStop(1, 'rgba(4,1,6,0.9)');
    ctx.fillStyle = bg; ctx.fillRect(0, by, vw, bandH);
    const tw = Math.min(760, vw - 140);
    if (narr) {
      const lines = wrap(ctx, shown, tw, 20, 700, FONT.title).slice(0, 4);
      const y0 = vh - BAR - 26 - (lines.length - 1) * 30;
      lines.forEach((s, i) => text(ctx, s, vw / 2, y0 + i * 30, { size: 20, align: 'center', weight: 700, family: FONT.title, color: '#e4dcf4', ow: 3 }));
    } else {
      const left = this.port.side !== 'right';
      const x = left ? Math.max(70, vw * 0.5 - tw / 2 + 60) : vw * 0.5 - tw / 2 - 20;
      const nameY = by + 52;
      ctx.save();
      ctx.shadowColor = 'rgba(179,18,46,0.9)'; ctx.shadowBlur = 12;
      text(ctx, this.sp.name, x, nameY, { size: 21, weight: 800, family: FONT.title, color: this.sp.color ?? '#f3d690', ow: 3 });
      ctx.restore();
      ctx.font = `800 21px ${FONT.title}`;
      const nw = ctx.measureText(this.sp.name).width;
      const lg = ctx.createLinearGradient(x, 0, x + nw + 120, 0);
      lg.addColorStop(0, 'rgba(232,200,114,0.8)'); lg.addColorStop(1, 'rgba(232,200,114,0)');
      ctx.fillStyle = lg; ctx.fillRect(x, nameY + 8, nw + 120, 1.5);
      const lines = wrap(ctx, shown, tw - 60, 19, 500).slice(0, 3);
      lines.forEach((s, i) => text(ctx, s, x, nameY + 38 + i * 28, { size: 19, color: BONE, ow: 3 }));
    }
    if (this.shown >= this.full.length && !this.menu && Math.floor(t * 2.5) % 2 === 0) text(ctx, '▼', vw - 60, vh - BAR - 14, { size: 14, align: 'center', color: GOLD, ow: 2 });
    // 선택지
    if (this.menu && this.shown >= this.full.length) {
      const ch = this.cur.choice, w = 420, h = 48;
      const y0 = vh * 0.5 - (ch.length * (h + 8)) / 2 - 40;
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, BAR, vw, vh - BAR * 2 - bandH + 20);
      this.menu.clearHits();
      ch.forEach((c, k) => {
        const r = { x: vw / 2 - w / 2, y: y0 + k * (h + 8), w, h };
        this.menu.hit(k, r);
        const a = ease.outCubic(clamp((this.lineT - 0.1 - k * 0.08) / 0.3, 0, 1));
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(12,4,14,0.85)'; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = this.menu.index === k ? GOLD : 'rgba(200,160,90,0.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        menuItem(ctx, r, this.resolveText(c.text), { selected: this.menu.index === k, size: 17, align: 'center' });
        ctx.restore();
      });
    }
  }
}
