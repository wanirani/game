// 대화 장면 (오버레이): 초상화 + 타자기 효과 + 선택지 + 명령
// push('dialogue', { script: id } | { npc: npcId } | { lines: [...] }, onEnd?)
// 스크립트 형식은 data/story.js 상단 주석 참고
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import { text, wrap, panel, FONT, COLORS, ListMenu, button } from '../core/ui.js';
import { SCRIPTS, resolveNpcScript } from '../data/story.js';
import { CHARACTERS } from '../data/characters.js';
import { NPCS } from '../data/npcs.js';
import { BOSSES } from '../data/bosses.js';
import { addByBase } from '../game/inventory.js';
import { bus } from '../core/events.js';
import { saves } from '../core/save.js';
import { clamp } from '../core/math.js';

// 초상화 가장자리를 부드럽게 (배경/CG 위에서 사각 경계가 보이지 않도록) — 이미지별 캐시
const _soft = new WeakMap();
function softPortrait(img) {
  let c = _soft.get(img);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const hx = g.createLinearGradient(0, 0, c.width, 0);
  hx.addColorStop(0, 'rgba(0,0,0,0)'); hx.addColorStop(0.12, 'rgba(0,0,0,1)'); hx.addColorStop(0.88, 'rgba(0,0,0,1)'); hx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hx; g.fillRect(0, 0, c.width, c.height);
  const hy = g.createLinearGradient(0, 0, 0, c.height);
  hy.addColorStop(0, 'rgba(0,0,0,0)'); hy.addColorStop(0.08, 'rgba(0,0,0,1)'); hy.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = hy; g.fillRect(0, 0, c.width, c.height);
  _soft.set(img, c);
  return c;
}

export function speakerInfo(who, state) {
  if (!who || who === 'narrator') return { name: '', portrait: null };
  if (who === 'hero') who = state?.charId ?? 'kael';
  if (CHARACTERS[who]) return { name: CHARACTERS[who].name, portrait: CHARACTERS[who].portrait, hero: true };
  if (NPCS[who]) return { name: NPCS[who].name, portrait: NPCS[who].portrait };
  if (BOSSES[who]) return { name: BOSSES[who].name, portrait: BOSSES[who].portrait };
  return { name: who, portrait: null };
}

const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export class DialogueScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ script, npc, lines, onEnd, world }) {
    this.world = world ?? this.game.world;
    if (this.world) this.world.cutscene = true;
    this.onEnd = onEnd;
    let L = lines;
    if (!L && npc) L = SCRIPTS[resolveNpcScript(npc, this.game.state, this.world?.stage?.id)] ?? [{ who: npc, text: '……' }];
    if (!L && script) L = SCRIPTS[script] ?? [{ who: 'narrator', text: `(대사 ${script} 없음)` }];
    this.lines = L || [];
    this.i = -1; this.shown = 0; this.menu = null;
    this.labels = {};
    // { label } 만 있는 줄이 이동 목표. { if, cmd:'goto', label } (ifFlag/ifChar) 은 조건부 이동 명령이다
    this.lines.forEach((l, k) => { if (l.label && !l.cmd) this.labels[l.label] = k; });
    this.next();
  }
  exit() { if (this.world) this.world.cutscene = false; }
  get state() { return this.game.state; }
  resolveText(t) {
    if (typeof t === 'string') return this.fill(t);
    if (t && typeof t === 'object') return this.fill(t[this.state?.charId] ?? t.default ?? Object.values(t)[0]);
    return '';
  }
  fill(s) { return String(s).replaceAll('{hero}', CHARACTERS[this.state?.charId]?.name ?? '헌터'); }
  next() {
    while (true) {
      this.i++;
      if (this.i >= this.lines.length) { this.finish(); return; }
      const l = this.lines[this.i];
      if (l.label && !l.cmd) continue;
      if (l.if && !this.check(l.if)) continue;
      if (l.cmd) { this.runCmd(l); if (l.cmd === 'goto') continue; continue; }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      this.cur = l;
      this.full = this.resolveText(l.text ?? '');
      this.shown = 0;
      this.menu = l.choice ? new ListMenu(l.choice.length) : null;
      return;
    }
  }
  check(cond) {
    const f = this.state?.progress?.flags ?? {};
    if (typeof cond === 'string') return cond.startsWith('!') ? !f[cond.slice(1)] : !!f[cond];
    if (cond.char) return this.state?.charId === cond.char;
    return true;
  }
  runCmd(l) {
    const st = this.state;
    switch (l.cmd) {
      case 'give': if (st) { addByBase(st, l.item, l.qty ?? 1); this.game.toast(`획득: ${l.name ?? l.item} ×${l.qty ?? 1}`, '#e8c872'); audio.sfx('item'); } break;
      case 'gold': if (st) { st.gold += l.amount; this.game.toast(`${l.amount} G 획득`, '#ffd84a'); audio.sfx('coin'); } break;
      case 'flag': if (st) st.progress.flags[l.key] = l.value ?? true; break;
      case 'quest': bus.emit('questOffer', { questId: l.id }); this.game.quests?.accept?.(l.id); break;
      case 'unlockChar': {
        const m = this.game.meta;
        if (!m.unlockedChars.includes(l.id)) { m.unlockedChars.push(l.id); saves.saveMeta(m); this.game.toast(`${CHARACTERS[l.id]?.name} 합류! (캐릭터 해금)`, '#ffe070'); audio.sfx('levelup'); }
        break;
      }
      case 'shake': this.world?.camera.shake(l.power ?? 8, l.time ?? 0.4); this.game.flash(l.color ?? '#fff', 0.4); break;
      case 'music': audio.music(l.id); break;
      case 'sfx': audio.sfx(l.id); break;
      case 'goto': this.i = (this.labels[l.label] ?? this.lines.length) - 1; break;
      case 'relic': if (st && !st.progress.relics.includes(l.id)) st.progress.relics.push(l.id); break;
      case 'cg': this.cg = l.id ? 'cg/' + l.id.replace(/^cg\//, '') : null; this.cgT = 0; break;
    }
  }
  finish() {
    this.game.pop();
    this.onEnd?.();
  }
  update(dt) {
    if (!this.cur) return;
    // 터치: 화면 오른쪽 위 '건너뛰기' 버튼 (가상 패드의 Ⅱ 는 대화 중 숨겨진다)
    if (this.skipRect && input.pointer.tapped && !this.menu && inRect(input.pointer, this.skipRect)) { audio.sfx('menu_cancel'); this.skipAll(); return; }
    const speed = 42;
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + speed * dt);
      if (Math.floor(this.shown) !== before && Math.floor(this.shown) % 3 === 0) audio.sfx('type', { vol: 0.15 });
      if (input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped) { this.shown = this.full.length; }
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
    if (input.pressed('confirm') || input.pressed('attack') || input.pointer.tapped || input.pressed('jump')) { audio.sfx('menu_move', { vol: 0.4 }); this.next(); }
    if (input.pressed('menu') && !input.pressed('confirm') && !this.cur.choice) this.skipAll(); // Enter(=menu+confirm)는 넘기기만
  }
  /** 대사 건너뛰기: 남은 명령(합류·플래그·지급·CG)은 실행하고, 선택지에서는 멈춘다 */
  skipAll() {
    while (++this.i < this.lines.length) {
      const l = this.lines[this.i];
      if ((l.label && !l.cmd) || (l.if && !this.check(l.if))) continue;
      if (l.cmd) { if (l.cmd !== 'sfx' && l.cmd !== 'shake') this.runCmd(l); continue; }
      if (l.goto && !l.text) { this.i = (this.labels[l.goto] ?? this.lines.length) - 1; continue; }
      if (l.choice) { this.i--; this.next(); return; }
    }
    this.finish();
  }
  render(ctx) {
    if (!this.cur) return;
    const vw = this.game.viewW, vh = this.game.viewH;
    const l = this.cur;
    const sp = speakerInfo(l.who, this.state);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, vw, vh);
    // 이벤트 CG (스크립트 {cmd:'cg', id:'cg_xxx'} 로 표시, id:null 로 해제)
    if (this.cg) {
      const img = assets.get(this.cg);
      if (img) {
        this.cgT = (this.cgT ?? 0) + 1 / 60;
        const a = Math.min(1, this.cgT * 2.5);
        const s = Math.max(vw / img.width, vh / img.height) * (1.04 + this.cgT * 0.004);
        ctx.save(); ctx.globalAlpha = a;
        ctx.drawImage(img, (vw - img.width * s) / 2, (vh - img.height * s) / 2, img.width * s, img.height * s);
        const g = ctx.createLinearGradient(0, vh * 0.45, 0, vh);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }
    }
    // 초상화 (이벤트 CG 가 떠 있으면 CG 속 인물과 겹치지 않도록 생략)
    const cgShown = this.cg && assets.get(this.cg);
    const img = sp.portrait && !cgShown ? assets.get(sp.portrait) : null;
    const side = l.side ?? (sp.hero ? 'left' : 'right');
    if (img) {
      const h = vh * 0.78, w = h * (img.width / img.height);
      const x = side === 'left' ? 30 : vw - w - 30;
      ctx.save();
      const grad = ctx.createLinearGradient(0, vh - h, 0, vh);
      ctx.globalAlpha = 0.97;
      ctx.drawImage(softPortrait(img), x, vh - h - 40, w, h);
      const fade = ctx.createLinearGradient(0, vh - 200, 0, vh - 40);
      fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = fade; ctx.fillRect(x, vh - 200, w, 160);
      ctx.restore();
    }
    // 대화창
    const bx = 60, bw = vw - 120, bh = 150, by = vh - bh - 18;
    panel(ctx, bx, by, bw, bh, { glow: 'rgba(180,20,40,0.4)' });
    if (sp.name) {
      panel(ctx, bx + 24, by - 22, Math.max(140, sp.name.length * 20 + 40), 36, { corner: false });
      text(ctx, sp.name, bx + 44, by + 3, { size: 18, weight: 800, family: FONT.title, color: '#f3d690' });
    }
    const lines = wrap(ctx, this.full.slice(0, Math.floor(this.shown)), bw - 70, 19, 500);
    lines.slice(0, 4).forEach((s, k) => text(ctx, s, bx + 34, by + 46 + k * 29, { size: 19, color: l.who === 'narrator' ? '#c8c0e0' : COLORS.text, ow: 2 }));
    if (this.shown >= this.full.length && !this.menu && Math.floor(this.t * 3) % 2 === 0) text(ctx, '▼', bx + bw - 34, by + bh - 16, { size: 14, color: COLORS.gold });
    // 터치 모드: 건너뛰기 버튼
    this.skipRect = null;
    if (input.touchMode && !this.menu) {
      this.skipRect = { x: vw - 132, y: 12, w: 118, h: 38 };
      button(ctx, this.skipRect, '건너뛰기 ▶▶', { size: 15 });
    }
    if (this.menu && this.shown >= this.full.length) {
      const ch = this.cur.choice;
      const w = 360, h = 44;
      ch.forEach((c, k) => {
        const r = { x: vw / 2 - w / 2, y: by - 30 - (ch.length - k) * (h + 8), w, h };
        this.menu.hit(k, r);
        button(ctx, r, this.resolveText(c.text), { selected: this.menu.index === k, size: 16 });
      });
    }
  }
}
