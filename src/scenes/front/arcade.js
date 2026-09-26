// 아케이드 모드 선택: 보스 러시 / 서바이벌 / 스테이지 연습 + 난이도·레벨 프리셋·코스/스테이지 → 캐릭터 선택 → 임시 세이브로 시작
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, wrap, FONT, ListMenu } from '../../core/ui.js';
import { clamp, ease, rgba, fmt, TAU } from '../../core/math.js';
import { CHARACTERS } from '../../data/characters.js';
import { CLASSES, classChain } from '../../data/classes.js';
import { DIFFICULTIES, getDiff } from '../../data/difficulty.js';
import { STAGES, STAGE_ORDER } from '../../data/stages.js';
import { BOSSES } from '../../data/bosses.js';
import { baseIdFor, ITEMS, makeItem } from '../../data/items.js';
import { SKILLS } from '../../data/skills.js';
import { SCRIPTS } from '../../data/story.js';
import * as QD from '../../data/quests.js';
import { newGameState } from '../../game/state.js';
import { addItem, addByBase } from '../../game/inventory.js';
import {
  Ambience, kenBurns, shade, frame, heading, ornament, portraitIn, gbutton, backButton, footer, setPad,
  follow, fmtClock, TapZones, bossRushBests, GOLD, BONE, DIM, CRIMSON,
} from './common.js';

export const ARCADE_MODES = {
  bossrush: { id: 'bossrush', name: '보스 러시', eng: 'BOSS RUSH', color: '#ff4a5a', art: 'portraits/b_dracula', desc: '악마성의 군주들과 쉬지 않고 연속으로 맞붙는다. 라운드 사이에 체력이 조금 회복된다. 가장 빠른 격파 시간에 도전하라!' },
  survival: { id: 'survival', name: '서바이벌', eng: 'SURVIVAL', color: '#ffa640', art: 'bg/s_arena', desc: '피의 투기장에 끝없이 몰려오는 마물의 물결. 웨이브를 넘길수록 적은 강해지고 점수 배율은 올라간다. 목숨은 단 하나!' },
  practice: { id: 'practice', name: '스테이지 연습', eng: 'STAGE PRACTICE', color: '#5aa8ff', art: 'bg/s06_library', desc: '해금한 스테이지를 이야기 없이 다시 도전한다. 클리어 시간과 점수, 랭크를 갈고닦아 명예의 전당에 이름을 올려라.' },
};
export const MODE_ORDER = ['bossrush', 'survival', 'practice'];
export const LEVEL_PRESETS = [
  { name: '견습 사냥꾼', lv: 10, tier: 0, wtier: 2, rarity: 1, enh: 3, docs: 4, potions: 3 },
  { name: '숙련 사냥꾼', lv: 25, tier: 1, wtier: 3, rarity: 2, enh: 6, docs: 10, potions: 4 },
  { name: '베테랑', lv: 40, tier: 2, wtier: 4, rarity: 3, enh: 9, docs: 16, potions: 5 },
  { name: '전설의 헌터', lv: 60, tier: 2, wtier: 6, rarity: 4, enh: 12, docs: 99, potions: 6 },
];
export const BOSS_ORDER = ['b_nightwing', 'b_banshee', 'b_dullahan', 'b_crimson', 'b_bonedragon', 'b_grimoire', 'b_chimera', 'b_leviathan', 'b_colossus', 'b_frostqueen', 'b_death', 'b_dracula', 'b_chaos'];
export const COURSES = [
  { name: '전반전', sub: '1~6장 보스', from: 0, to: 6 },
  { name: '후반전', sub: '7~13장 보스', from: 6, to: 13 },
  { name: '전 보스 연속', sub: '13연전', from: 0, to: 13 },
];
export function courseBosses(ci) {
  const c = COURSES[ci] ?? COURSES[0];
  const ids = BOSS_ORDER.slice(c.from, c.to);
  const have = ids.filter((id) => BOSSES[id]);
  return have.length ? have : ids; // 데이터가 아직 없으면 범용 보스로라도 진행
}
/** 모든 슬롯에서 해금된 스테이지 합집합 (연습 모드용) */
export function practiceStages(game) {
  const set = new Set(['s01']);
  for (const s of saves.list()) {
    if (s.empty) continue;
    for (const id of saves.read(s.slot)?.progress?.unlocked ?? []) set.add(id);
  }
  if (game.meta?.konami) STAGE_ORDER.forEach((id) => set.add(id));
  return STAGE_ORDER.filter((id) => set.has(id) && STAGES[id]);
}

/** 아케이드 전용 임시 세이브 (슬롯 0, 영구 저장 안 함) */
export function buildArcadeState(cfg, charId) {
  const P = LEVEL_PRESETS[cfg.preset ?? 1] ?? LEVEL_PRESETS[1];
  const st = newGameState({ slot: 0, difficulty: cfg.diff ?? 'normal', charId });
  st.slot = 0;
  st.arcade = { ...cfg };
  st.gold = 0;
  st.score = 0;
  const hero = st.heroes[charId];
  const ch = CHARACTERS[charId];
  hero.level = P.lv; hero.exp = 0; hero.sp = 0;
  // 직업: 첫 번째 계보로 전직
  let cls = hero.classId;
  for (let k = 0; k < P.tier; k++) { const nx = CLASSES[cls]?.next?.[k === 0 ? (charId.length % 2) : 0]; if (nx && CLASSES[nx]) cls = nx; }
  hero.classId = cls;
  // 무기·방어구
  // 무기·방어구: 티어(1~6)에 맞는 베이스 (baseIdFor)
  {
    const id = baseIdFor('weapon', Math.min(6, P.wtier), { wtype: ch.weaponType, variant: 2 }) || baseIdFor('weapon', Math.min(6, P.wtier), { wtype: ch.weaponType });
    if (id && ITEMS[id]) { const it = makeItem(id, { rarity: P.rarity, level: P.enh }); if (it) { addItem(st, it); hero.equip.weapon = it.uid; } }
  }
  for (const slot of ['body', 'head', 'cloak']) {
    const id = baseIdFor(slot, Math.min(6, P.wtier));
    if (id && ITEMS[id]) { const it = makeItem(id, { rarity: Math.max(0, P.rarity - 1), level: Math.floor(P.enh / 2) }); if (it) { addItem(st, it); hero.equip[slot] = it.uid; } }
  }
  // 비전서 (스테이지 순서대로 P.docs 개)
  const docIds = [];
  for (const sid of STAGE_ORDER) for (const d of STAGES[sid]?.docs ?? []) docIds.push(d);
  st.progress.docs = docIds.slice(0, P.docs);
  // 스킬: 이 캐릭터의 액티브 스킬을 레벨에 맞게 습득·장착
  try {
    const chain = new Set(classChain(hero.classId).map((c) => c.id));
    const mine = Object.values(SKILLS).filter((s) => s && s.charId === charId && (s.reqLevel ?? 1) <= P.lv && (!s.reqClass || chain.has(s.reqClass)));
    const lvOf = (s) => Math.max(1, Math.min(s.maxLv ?? 5, 1 + Math.floor(P.lv / 12)));
    for (const s of mine) hero.skills[s.id] = lvOf(s);
    const actives = mine.filter((s) => (s.type ?? 'active') === 'active');
    const slots = [...(hero.slots ?? [null, null, null, null])];
    for (const s of actives) { if (slots.includes(s.id)) continue; const i = slots.indexOf(null); if (i < 0) break; slots[i] = s.id; }
    hero.slots = slots;
  } catch { /* 스킬 데이터 교체 중 */ }
  // 소모품
  try { addByBase(st, 'c_potion', P.potions); } catch { /* 무시 */ }
  // 스토리 대사·퀘스트 알림은 건너뜀
  st.progress.seenScripts = Object.keys(SCRIPTS);
  st.quests = { active: {}, done: Object.keys(QD.QUESTS ?? {}) };
  st.progress.unlocked = [...STAGE_ORDER];
  const d = getDiff(cfg.diff);
  st.lives = cfg.kind === 'survival' ? 1 : d.lives;
  return st;
}
/** 캐릭터 선택 후 호출: 임시 세이브를 만들고 모드 장면으로 */
export function startArcade(game, cfg, charId) {
  if (!game.state?.arcade) game._arcadePrev = game.state ?? null;
  game.state = buildArcadeState(cfg, charId);
  const scene = cfg.kind === 'practice' ? 'practice' : cfg.kind;
  game.go(scene, { cfg: { ...cfg, charId } }, { fadeTime: 0.6 });
}
/** 아케이드 종료 시 이전 세이브 복원 */
export function endArcade(game) {
  if (game.state?.arcade) game.state = game._arcadePrev ?? null;
  game._arcadePrev = null;
}

export class ArcadeScene extends Scene {
  enter({ cfg = null } = {}) {
    setPad(false);
    endArcade(this.game);
    audio.music('title');
    const m = this.game.meta;
    this.cfg = { kind: 'bossrush', diff: 'normal', preset: 1, course: 0, stageId: 's01', ...(m.arcadeCfg ?? {}), ...(cfg ?? {}) };
    this.stages = practiceStages(this.game);
    if (!this.stages.includes(this.cfg.stageId)) this.cfg.stageId = this.stages[0];
    this.row = 0; // 0: 모드 카드, 1..: 옵션 줄
    this.modeMenu = new ListMenu(3, { cols: 3, index: Math.max(0, MODE_ORDER.indexOf(this.cfg.kind)) });
    this.amb = new Ambience({ embers: 50, motes: 20, bats: 6, lightning: true });
    this.amb.nextBolt = 3;
    this.selK = [0, 0, 0];
    this.taps = new TapZones();
  }
  exit() { setPad(true); }
  onResume() { setPad(false); }
  get kind() { return MODE_ORDER[this.modeMenu.index]; }
  options() {
    const c = this.cfg, k = this.kind;
    const rows = [
      { id: 'diff', label: '난이도', value: getDiff(c.diff).name, color: getDiff(c.diff).color, n: DIFFICULTIES.length, i: DIFFICULTIES.findIndex((d) => d.id === c.diff), set: (i) => { c.diff = DIFFICULTIES[i].id; } },
      { id: 'preset', label: '헌터 등급', value: `${LEVEL_PRESETS[c.preset].name} (Lv.${LEVEL_PRESETS[c.preset].lv})`, n: LEVEL_PRESETS.length, i: c.preset, set: (i) => { c.preset = i; } },
    ];
    if (k === 'bossrush') rows.push({ id: 'course', label: '코스', value: `${COURSES[c.course].name} · ${COURSES[c.course].sub}`, n: COURSES.length, i: c.course, set: (i) => { c.course = i; } });
    if (k === 'practice') {
      const si = Math.max(0, this.stages.indexOf(c.stageId));
      const st = STAGES[this.stages[si]];
      rows.push({ id: 'stage', label: '스테이지', value: `제${st.chapter}장 ${st.name}`, n: this.stages.length, i: si, set: (i) => { c.stageId = this.stages[i]; } });
    }
    return rows;
  }
  change(row, d) {
    const r = this.options()[row];
    if (!r) return;
    const i = (r.i + d + r.n) % r.n;
    if (i === r.i) return;
    r.set(i); audio.sfx('menu_move');
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.viewW, g.viewH);
    this.selK = this.selK.map((v, i) => follow(v, i === this.modeMenu.index ? 1 : 0, dt, 12));
    const tap = this.taps.hit();
    if (tap === 'back') { this.leave(); return; }
    if (tap === 'start') { this.go(); return; }
    if (tap?.[0] === 'arrow') { const [, row, d] = tap; this.row = row + 1; this.change(row, d); return; }
    const opts = this.options();
    if (this.row === 0) {
      const r = this.modeMenu.update(dt);
      if (this.modeMenu.moved) { audio.sfx('menu_move'); this.cfg.kind = this.kind; }
      if (input.pressed('down')) { this.row = 1; audio.sfx('menu_move'); return; }
      if (r === 'confirm') { if (input.pointer.tapped) { this.cfg.kind = this.kind; audio.sfx('menu_ok'); } else this.go(); }
      else if (r === 'cancel') this.leave();
      return;
    }
    // 옵션 줄
    if (input.pressed('up')) { this.row--; audio.sfx('menu_move'); }
    else if (input.pressed('down')) { if (this.row < opts.length) { this.row++; audio.sfx('menu_move'); } }
    else if (input.pressed('left')) this.change(this.row - 1, -1);
    else if (input.pressed('right')) this.change(this.row - 1, 1);
    else if (input.pressed('confirm')) this.go();
    else if (input.pressed('cancel')) { this.row = 0; audio.sfx('menu_cancel'); }
    // 옵션 줄에 있을 때 모드 카드를 탭하면 그 모드 선택으로 돌아감 (터치: 첫 탭은 선택만 하므로 moved 도 처리)
    if (input.pointer.tapped) { const r0 = this.modeMenu.update(0); if (r0 === 'confirm' || this.modeMenu.moved) { this.row = 0; this.cfg.kind = this.kind; audio.sfx('menu_ok'); } }
    this.row = clamp(this.row, 0, opts.length);
  }
  go() {
    const g = this.game;
    this.cfg.kind = this.kind;
    g.meta.arcadeCfg = { ...this.cfg }; saves.saveMeta(g.meta);
    audio.sfx('menu_ok'); audio.sfx('coin_insert');
    g.flash(ARCADE_MODES[this.kind].color, 0.3, 3);
    g.go('charselect', { mode: 'arcade', arcade: { ...this.cfg }, difficulty: this.cfg.diff });
  }
  leave() { audio.sfx('menu_cancel'); this.game.go('title', { menu: true, index: 2 }); }

  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    const M = ARCADE_MODES[this.kind];
    kenBurns(ctx, assets.get('bg/s_arena'), vw, vh, t, { z0: 1.04, z1: 1.1, period: 58 });
    ctx.fillStyle = 'rgba(6,2,10,0.6)'; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gg = ctx.createRadialGradient(vw / 2, vh * 0.45, 20, vw / 2, vh * 0.45, vw * 0.6);
    gg.addColorStop(0, rgba(M.color, 0.14)); gg.addColorStop(1, rgba(M.color, 0));
    ctx.fillStyle = gg; ctx.fillRect(0, 0, vw, vh); ctx.restore();
    this.amb.draw(ctx, vw, vh, 'back', t);
    shade(ctx, vw, vh, { top: 0.6, bottom: 0.75, vig: 0.8 });
    this.amb.draw(ctx, vw, vh, 'front', t);
    const ap = ease.outCubic(clamp(this.t / 0.5, 0, 1));
    heading(ctx, vw / 2, 46, 'ARCADE MODE', '도전할 모드를 선택하세요', { size: 30, alpha: ap });
    // 카드
    const gap = 16, cw = Math.min(270, (vw - 80 - gap * 2) / 3), ch = 212, x0 = vw / 2 - (cw * 3 + gap * 2) / 2, y0 = 100;
    this.modeMenu.clearHits(); this.taps.clear();
    MODE_ORDER.forEach((id, i) => {
      const k = ease.outCubic(clamp((this.t - i * 0.07) / 0.45, 0, 1));
      const r = { x: x0 + i * (cw + gap), y: y0 + (1 - k) * 50, w: cw, h: ch };
      this.modeMenu.hit(i, r);
      this.drawCard(ctx, r, ARCADE_MODES[id], this.selK[i], k, i === this.modeMenu.index);
    });
    // 옵션
    const opts = this.options();
    const ow = Math.min(560, vw - 120), ox = vw / 2 - ow / 2, oy = y0 + ch + 18, oh = 34;
    frame(ctx, ox - 12, oy - 8, ow + 24, opts.length * oh + 16, { accent: '#8a6a3a', corners: false, edge: 0.4, fill0: 'rgba(14,6,16,0.8)' });
    opts.forEach((o, i) => {
      const y = oy + i * oh, sel = this.row === i + 1;
      if (sel) {
        const lg = ctx.createLinearGradient(ox, 0, ox + ow, 0);
        lg.addColorStop(0, 'rgba(179,18,46,0)'); lg.addColorStop(0.5, 'rgba(179,18,46,0.55)'); lg.addColorStop(1, 'rgba(179,18,46,0)');
        ctx.fillStyle = lg; ctx.fillRect(ox, y, ow, oh);
      }
      text(ctx, o.label, ox + 16, y + 23, { size: 15, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2 });
      const vx = ox + ow * 0.62;
      text(ctx, o.value, vx, y + 23, { size: 15, align: 'center', weight: 800, color: o.color ?? (sel ? GOLD : BONE), ow: 2 });
      const lr = { x: vx - 170, y: y - 2, w: 44, h: oh + 4 }, rr = { x: vx + 126, y: y - 2, w: 44, h: oh + 4 };
      for (const [r, d, s] of [[lr, -1, '◀'], [rr, 1, '▶']]) {
        text(ctx, s, r.x + r.w / 2, r.y + r.h / 2 + 6, { size: 16, align: 'center', color: sel ? GOLD : 'rgba(232,200,114,0.45)', ow: 2 });
        this.taps.add(['arrow', i, d], r);
      }
    });
    // 기록 + 시작
    const by = oy + opts.length * oh + 14;
    const best = this.bestText();
    if (best) text(ctx, best, ox, by + 30, { size: 12, weight: 700, color: '#d8c0a0', ow: 2 });
    const br = { x: vw / 2 + ow / 2 - 200, y: by + 4, w: 200, h: 46 };
    gbutton(ctx, br, '헌터 선택으로', { selected: true, accent: M.color, size: 16, icon: '▶', zones: this.taps, id: 'start' });
    backButton(ctx, 14, 12, '뒤로', this.taps);
    footer(ctx, vw, vh, this.row === 0 ? '←→ 모드   ↓ 옵션   Z 결정   X 뒤로' : '↑↓ 항목   ←→ 변경   Z 결정   X 모드 선택', '카드와 ◀ ▶ 버튼을 터치하세요');
  }
  bestText() {
    const m = this.game.meta;
    const hs = (m.highScores ?? []).filter((h) => h.mode === this.kind);
    const top = hs[0];
    if (this.kind === 'bossrush') {
      const b = bossRushBests(m)[this.cfg.course ?? 0];
      if (b) return `${COURSES[this.cfg.course ?? 0]?.name ?? ''} 최단 기록  ${fmtClock(b.time ?? 0)} · ${fmt(b.score ?? 0)}점 · ${CHARACTERS[b.charId]?.name ?? ''}`;
    }
    if (this.kind === 'survival' && (m.survivalBest ?? 0) > 0) return `최고 기록  웨이브 ${m.survivalBest}${top ? ` · ${fmt(top.score)}점` : ''}`;
    if (top) return `최고 점수  ${fmt(top.score)}점 · ${top.name || CHARACTERS[top.charId]?.name || ''}`;
    return '아직 기록이 없습니다';
  }
  drawCard(ctx, r, M, s, k, cur) {
    const t = this.game.time;
    const sc = 1 + 0.04 * s;
    ctx.save();
    ctx.globalAlpha = k * (0.7 + 0.3 * s);
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(sc, sc); ctx.translate(-r.w / 2, -r.h / 2);
    frame(ctx, 0, 0, r.w, r.h, { accent: M.color, glow: s * (cur && this.row === 0 ? 1.2 : 0.5), edge: 0.4 + 0.6 * s });
    const ar = { x: 6, y: 6, w: r.w - 12, h: 112 };
    const img = assets.get(M.art);
    portraitIn(ctx, img, ar, { fy: M.art.startsWith('portraits') ? 0.18 : 0.5, zoom: 1 + 0.03 * s, fadeBottom: 0.55 });
    if (M.id === 'bossrush') {
      // 보스 초상화 몽타주
      const ids = ['b_nightwing', 'b_death', 'b_chaos'];
      ids.forEach((id, j) => {
        const pr = { x: 6 + j * (ar.w / 3), y: 6, w: ar.w / 3, h: 112 };
        portraitIn(ctx, assets.get(`portraits/${id}`), pr, { fy: 0.15, zoom: 1.2, fadeBottom: 0.6, alpha: 0.95 });
      });
    }
    const lg = ctx.createLinearGradient(0, 0, r.w, 0);
    lg.addColorStop(0, rgba(M.color, 0)); lg.addColorStop(0.5, rgba(M.color, 0.7)); lg.addColorStop(1, rgba(M.color, 0));
    ctx.fillStyle = lg; ctx.fillRect(6, 117, r.w - 12, 2);
    text(ctx, M.eng, r.w / 2, 110, { size: 14, align: 'center', weight: 900, family: FONT.logo, color: M.color, ow: 4 });
    text(ctx, M.name, r.w / 2, 146, { size: 22, align: 'center', weight: 800, family: FONT.title, color: '#fff4e0', ow: 4 });
    wrap(ctx, M.desc, r.w - 24, 12, 500).slice(0, 3).forEach((l, i) => text(ctx, l, r.w / 2, 170 + i * 15, { size: 12, align: 'center', color: '#d0c4b4', ow: 2 }));
    ctx.restore();
  }
}
