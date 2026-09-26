// 엔딩: 진행도로 배드/노멀/트루 판정 → 엔딩 제목 연출 → ending_* 컷신(bg/ending) → 크레딧 롤(슬라이드쇼 + 여정 통계 + 해금 안내)
// → (순위권이면) 이니셜 입력 → 타이틀/마을
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, FONT } from '../../core/ui.js';
import { clamp, ease, fmt, rgba, lerp } from '../../core/math.js';
import * as STORY from '../../data/story.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { BOSSES } from '../../data/bosses.js';
import { NPCS } from '../../data/npcs.js';
import { getDiff } from '../../data/difficulty.js';
import { Ambience, kenBurns, ornament, frame, setPad, goSafe, qualifies, fmtPlay, GOLD, BONE, DIM } from './common.js';

// name 은 ending_* 대사 끝의 '— ○○ END : 이름 —' 과 같아야 한다 (제목 카드·크레딧 달성 목록에 표시)
// bg 는 제목 카드와 엔딩 컷신의 기본 배경 (배드 엔딩은 밝은 여명 대신 붉은 달의 성)
export const ENDINGS = {
  bad: { id: 'bad', eng: 'BAD ENDING', name: '끝나지 않는 밤', color: '#ff4a5a', bg: 'cg/cg_bad_ending', music: 'sad', no: 'Ⅰ' },
  normal: { id: 'normal', eng: 'NORMAL ENDING', name: '백 년의 새벽', color: '#ffd070', bg: 'bg/ending', music: 'ending', no: 'Ⅱ' },
  true: { id: 'true', eng: 'TRUE ENDING', name: '영원한 새벽', color: '#fff2b0', bg: 'bg/ending', music: 'ending', no: 'Ⅲ' },
};

/** 진행도로 엔딩 종류 판정 (from 스테이지가 있으면 data/story.js endingAfter 규칙을 우선). null = 엔딩 아님(계속 진행) */
export function decideEnding(st, from = null) {
  if (from && typeof STORY.endingAfter === 'function') {
    const id = STORY.endingAfter(from, st);
    return id ? id.replace(/^ending_/, '') : null;
  }
  const p = st?.progress ?? {};
  if (p.cleared?.s13 || p.bosses?.includes('b_chaos') || p.flags?.boss_b_chaos) return 'true';
  const f = p.flags ?? {};
  if (f.carmilla_trust2 || f.carmilla_trust) return 'normal';
  return 'bad';
}

export class EndingScene extends Scene {
  enter({ kind = null, from = null } = {}) {
    setPad(false);
    const g = this.game, st = g.state;
    this.kind = ENDINGS[kind] ? kind : decideEnding(st, from);
    if (!ENDINGS[this.kind]) {
      // 유물을 모두 모은 채 드라큘라를 쓰러뜨림 → 엔딩 대신 심연의 문(13장)으로
      this.skip = true;
      if (st?.progress && !st.progress.unlocked.includes('s13')) st.progress.unlocked.push('s13');
      goSafe(g, 'hub', { from }, { fadeTime: 0.8 });
      this.E = ENDINGS.normal; this.amb = new Ambience({ embers: 0, motes: 0, bats: 0, fog: false, lightning: false });
      return;
    }
    this.E = ENDINGS[this.kind];
    const m = g.meta;
    if (m) {
      m.endingsSeen ??= [];
      if (!m.endingsSeen.includes(this.kind)) m.endingsSeen.push(this.kind);
      m.clears = (m.clears ?? 0) + 1;
      saves.saveMeta(m);
    }
    if (st?.progress) {
      st.progress.flags['ending_' + this.kind] = true;
      st.progress.flags.endingSeen = this.kind;
      if (st.slot >= 1 && !st.arcade) saves.write(st.slot, st);
    }
    audio.stopMusic(1.2);
    this.amb = new Ambience({ embers: 50, motes: 30, bats: 0, fog: true, lightning: false, emberColor: this.kind === 'bad' ? '#ff4a3a' : '#ffd890' });
    assets.get(this.E.bg);
  }
  exit() { setPad(true); }
  update(dt) {
    this.amb.update(dt, this.game.viewW, this.game.viewH);
    if (this.skip) return;
    if (this.t > 0.8 && !this.played) { this.played = true; audio.music(this.E.music); }
    const adv = this.t > 1.5 && (input.pressed('confirm') || input.pointer.tapped);
    if ((this.t > 5.2 || adv) && !this.went) {
      this.went = true;
      this.game.go('story', { script: `ending_${this.kind}`, bg: this.E.bg, then: 'credits', thenParams: { kind: this.kind, fromEnding: true } }, { fadeTime: 1.0 });
    }
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    const a = ease.inOutQuad(clamp((this.t - 0.4) / 2.2, 0, 1));
    kenBurns(ctx, assets.get(this.E.bg), vw, vh, this.t, { z0: 1.16, z1: 1.04, period: 30, alpha: a * (this.kind === 'bad' ? 0.55 : 0.85) });
    if (this.kind === 'bad') { ctx.fillStyle = `rgba(60,0,10,${0.35 * a})`; ctx.fillRect(0, 0, vw, vh); }
    this.amb.draw(ctx, vw, vh, 'front', t);
    const k = ease.outCubic(clamp((this.t - 1.2) / 1.2, 0, 1));
    const out = clamp((5.2 - this.t) / 0.8, 0, 1);
    ctx.save();
    ctx.globalAlpha = k * out;
    text(ctx, `ENDING ${this.E.no}`, vw / 2, vh / 2 - 56, { size: 16, align: 'center', weight: 900, family: FONT.num, color: DIM, ow: 3 });
    ctx.shadowColor = rgba(this.E.color, 0.8); ctx.shadowBlur = 24;
    text(ctx, this.E.eng, vw / 2, vh / 2 - 8, { size: 46, align: 'center', weight: 900, family: FONT.logo, color: this.E.color, ow: 6 });
    ctx.shadowBlur = 0;
    ornament(ctx, vw / 2, vh / 2 + 14, 460 * k, { color: this.E.color });
    text(ctx, `「${this.E.name}」`, vw / 2, vh / 2 + 54, { size: 24, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 4 });
    ctx.restore();
  }
}

// ───────────────────────────── 크레딧 ─────────────────────────────
function defaultCredits() {
  const cast = CHAR_ORDER.map((id) => [CHARACTERS[id].title, CHARACTERS[id].name]);
  const npcs = Object.values(NPCS).map((n) => [n.title ?? '', n.name]);
  const bosses = Object.values(BOSSES).map((b) => [b.title ?? '', b.name]);
  return [
    { logo: true },
    { h: '등장인물', rows: cast },
    npcs.length ? { h: '에슈빌 사람들', rows: npcs } : null,
    bosses.length ? { h: '악마성의 군주들', rows: bosses } : null,
    { h: '게임 디자인 · 연출', rows: [['총괄 디렉션', 'Claude 개발팀'], ['전투 · 아케이드 설계', 'Claude 개발팀'], ['레벨 디자인', 'Claude 개발팀']] },
    { h: '프로그래밍', rows: [['엔진 · 캔버스 렌더러', 'Claude 개발팀'], ['캐릭터 · 몬스터 절차 애니메이션', 'Claude 개발팀'], ['보스 AI · 전투 시스템', 'Claude 개발팀'], ['UI · 연출', 'Claude 개발팀']] },
    { h: '아트', rows: [['배경 · 초상화 · 이벤트 CG', 'Kling AI 생성 원화'], ['아이콘 · 소품 렌더', 'Blender'], ['픽셀 이펙트', '절차적 파티클']] },
    { h: '사운드', rows: [['배경 음악 · 효과음', 'Web Audio 절차 합성']] },
    { h: '특별히 감사드립니다', rows: [['', '고전 고딕 액션 게임을 사랑한 모든 이들'], ['', '그리고 끝까지 함께해 준 당신']] },
  ].filter(Boolean);
}
const SLIDES = ['cg/cg_prologue_moon', 'bg/s01_village', 'bg/s02_graveyard', 'bg/s03_gate', 'bg/s04_hall', 'bg/s05_catacombs', 'bg/s06_library', 'bg/s07_alchemy', 'bg/s08_waterway', 'bg/s09_clocktower', 'bg/s10_spire', 'bg/s11_chapel', 'bg/s12_throne', 'bg/s13_abyss'];

export class CreditsScene extends Scene {
  enter({ kind = null, fromEnding = false, back = null } = {}) {
    setPad(false);
    const g = this.game;
    this.kind = kind; this.fromEnding = fromEnding; this.back = back;
    this.E = ENDINGS[kind] ?? null;
    const custom = typeof STORY.creditsFor === 'function' ? STORY.creditsFor(kind, g.state, g.meta) : STORY.CREDITS;
    this.blocks = Array.isArray(custom) && custom.length ? this.normalize(custom) : defaultCredits();
    this.slides = [...SLIDES];
    if (kind === 'true') this.slides.push('cg/cg_true_ending', 'bg/ending');
    else if (kind === 'bad') this.slides.push('cg/cg_bad_ending');
    else this.slides.push('cg/cg_castle_collapse', 'bg/ending');
    this.slides.forEach((k) => assets.get(k));
    this.scroll = 150; this.phase = 'roll'; this.phaseT = 0;
    this.amb = new Ambience({ embers: 40, motes: 30, bats: 3, fog: false, lightning: false, emberColor: '#ffd890' });
    audio.music('credits');
    this.stats = fromEnding ? this.buildStats() : null;
    this.height = this.measure();
  }
  exit() { setPad(true); }
  normalize(list) {
    // data/story.js CREDITS: 문자열 배열('— 제목 —' 은 소제목, '' 은 간격) 또는 [{title|h, names|rows}] 형태 모두 허용
    if (list.every((x) => typeof x === 'string')) {
      const out = [{ logo: true }];
      let cur = null, i = 0;
      if (list[0] === 'BLOOD NOCTURNE') i = list[1] && !list[1].startsWith('—') ? 2 : 1;
      for (; i < list.length; i++) {
        const s = list[i].trim();
        if (!s) { cur = null; continue; }
        const m = s.match(/^—\s*(.+?)\s*—$/);
        if (m) { cur = { h: m[1], rows: [] }; out.push(cur); continue; }
        if (!cur) { cur = { h: '', rows: [] }; out.push(cur); }
        const parts = s.split(' — ');
        cur.rows.push(parts.length === 2 ? [parts[0], parts[1]] : ['', s]);
      }
      return out;
    }
    return list.map((b) => {
      if (b.logo) return b;
      const h = b.h ?? b.title ?? b.role ?? '';
      const rows = (b.rows ?? b.names ?? b.people ?? []).map((r) => (Array.isArray(r) ? r : typeof r === 'object' ? [r.role ?? '', r.name ?? ''] : ['', String(r)]));
      return { h, rows };
    });
  }
  measure() {
    let h = 0;
    for (const b of this.blocks) h += b.logo ? 200 : 60 + b.rows.length * 30 + 40;
    return h;
  }
  buildStats() {
    const st = this.game.state;
    if (!st) return null;
    const s = st.stats ?? {}, p = st.progress ?? {};
    const hero = st.heroes?.[st.charId];
    return {
      rows: [
        ['총 플레이 시간', fmtPlay(s.playTime ?? 0)],
        ['쓰러뜨린 적', `${fmt(s.kills ?? 0)}`],
        ['격파한 보스', `${p.bosses?.length ?? 0} / 13`],
        ['사망 횟수', `${s.deaths ?? 0}`],
        ['최대 콤보', `${s.maxCombo ?? 0} HITS`],
        ['비전서', `${p.docs?.length ?? 0} / 20`],
        ['드라큘라의 유물', `${p.relics?.length ?? 0} / 5`],
        ['강화 기록', `성공 ${s.enhanceOk ?? 0} · 실패 ${s.enhanceFail ?? 0}`],
        ['벌어들인 골드', `${fmt(s.goldEarned ?? 0)} G`],
        ['최종 레벨', `Lv.${hero?.level ?? 1}`],
      ],
      score: st.score ?? 0, diff: getDiff(st.difficulty), charId: st.charId, relics: p.relics?.length ?? 0,
    };
  }
  notes() {
    const m = this.game.meta, out = [];
    const seen = m?.endingsSeen ?? [];
    out.push(`달성한 엔딩 ${seen.length} / 3  (${['bad', 'normal', 'true'].map((k) => (seen.includes(k) ? ENDINGS[k].name : '???')).join(' · ')})`);
    if (this.kind === 'bad') out.push('힌트: 수수께끼의 귀부인을 믿어 보는 것은 어떨까…');
    if (this.kind !== 'true') out.push('힌트: 드라큘라의 유물 다섯 개를 모두 모으고 백작을 쓰러뜨리면 심연의 문이 열린다');
    if (this.kind === 'true') out.push('모든 밤을 끝낸 전설의 헌터에게 경의를! 아케이드 모드에서 한계에 도전해 보세요');
    out.push('아케이드 모드: 보스 러시 · 서바이벌 · 스테이지 연습에서 명예의 전당에 도전하세요');
    return out;
  }
  update(dt) {
    const g = this.game;
    this.amb.update(dt, g.viewW, g.viewH);
    this.phaseT += dt;
    const fast = input.down('confirm') || input.down('attack') || input.pointer.down;
    if (this.phase === 'roll') {
      this.scroll += dt * (fast ? 190 : 46);
      if (input.pressed('menu') || input.pressed('cancel') || this.scroll > this.height + g.viewH * 0.55) { this.phase = this.stats ? 'stats' : 'end'; this.phaseT = 0; audio.sfx('menu_ok'); }
      return;
    }
    if (this.phaseT < 0.8) return;
    if (input.pressed('confirm') || input.pressed('menu') || input.pressed('cancel') || input.pointer.tapped) {
      if (this.phase === 'stats') { this.phase = 'end'; this.phaseT = 0; audio.sfx('menu_ok'); return; }
      this.leave();
    }
  }
  leave() {
    if (this.left) return;
    this.left = true;
    const g = this.game;
    if (!this.fromEnding) { g.go(this.back === 'hub' ? 'hub' : 'title', this.back === 'hub' ? {} : { menu: true, index: 5 }); return; }
    const st = g.state;
    const after = () => (this.kind === 'true' || !st ? g.go('title', {}) : goSafe(g, 'hub', { from: 'ending' }));
    const score = st?.score ?? 0;
    if (qualifies(g, 'story', score)) {
      g.push('initials', { score, mode: 'story', entry: { charId: st.charId, diff: st.difficulty, stageId: 'ending', ending: this.kind }, onDone: after });
    } else after();
  }
  render(ctx) {
    const g = this.game, vw = g.viewW, vh = g.viewH, t = g.time;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    // 슬라이드쇼 (좌측, 7초 간격 크로스페이드)
    const per = 7, n = this.slides.length, u = this.t / per;
    const i0 = Math.floor(u) % n, i1 = (i0 + 1) % n, f = clamp((u % 1 - 0.8) / 0.2, 0, 1);
    const sw = this.phase === 'roll' ? vw * 0.56 : vw;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, sw, vh); ctx.clip();
    kenBurns(ctx, assets.get(this.slides[i0]), sw, vh, (u % 1) * per + i0 * 11, { z0: 1.04, z1: 1.14, period: per * 2, alpha: 0.8 });
    if (f > 0) kenBurns(ctx, assets.get(this.slides[i1]), sw, vh, i1 * 11, { z0: 1.04, z1: 1.14, period: per * 2, alpha: 0.8 * f });
    if (this.phase === 'roll') {
      const fr = ctx.createLinearGradient(sw * 0.5, 0, sw * 0.98, 0);
      fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fr; ctx.fillRect(0, 0, sw + 1, vh);
    }
    ctx.restore();
    if (this.phase === 'roll') {
      // 오른쪽 크레딧 영역: 은은한 진홍빛
      const rg = ctx.createRadialGradient(vw * 0.78, vh * 0.5, 20, vw * 0.78, vh * 0.5, vh * 0.7);
      rg.addColorStop(0, 'rgba(60,8,20,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, vw, vh);
    }
    const vg = ctx.createLinearGradient(0, 0, 0, vh);
    vg.addColorStop(0, 'rgba(0,0,0,0.7)'); vg.addColorStop(0.2, 'rgba(0,0,0,0)'); vg.addColorStop(0.8, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    this.amb.draw(ctx, vw, vh, 'front', t);
    if (this.phase === 'roll') this.drawRoll(ctx, vw, vh, t);
    else if (this.phase === 'stats') this.drawStats(ctx, vw, vh, t);
    else this.drawEnd(ctx, vw, vh, t);
  }
  drawRoll(ctx, vw, vh, t) {
    const cx = vw * 0.76;
    let y = vh + 20 - this.scroll;
    for (const b of this.blocks) {
      if (b.logo) {
        if (y > -220 && y < vh + 40) {
          ctx.save(); ctx.shadowColor = 'rgba(179,18,46,0.9)'; ctx.shadowBlur = 20;
          text(ctx, 'BLOOD NOCTURNE', cx, y + 70, { size: 34, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 5 });
          ctx.restore();
          ornament(ctx, cx, y + 90, 320);
          text(ctx, '블러드 녹턴 : 악마성 연대기', cx, y + 124, { size: 18, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3 });
        }
        y += 200; continue;
      }
      if (y > -40 && y < vh + 40) text(ctx, b.h, cx, y + 20, { size: 18, align: 'center', weight: 900, family: FONT.title, color: '#e8c872', ow: 3 });
      y += 60;
      for (const [role, name] of b.rows) {
        if (y > -40 && y < vh + 40) {
          if (role) {
            text(ctx, role, cx - 10, y, { size: 13, align: 'right', weight: 600, color: DIM, ow: 2 });
            text(ctx, name, cx + 10, y, { size: 16, weight: 800, color: BONE, ow: 2, maxWidth: vw - cx - 24 });
          } else text(ctx, name, cx, y, { size: 16, align: 'center', weight: 800, color: BONE, ow: 2, maxWidth: (vw - cx) * 2 - 30 });
        }
        y += 30;
      }
      y += 40;
    }
    // 하단 안내 띠: 올라오는 크레딧 줄이 안내 문구와 겹치지 않도록 아래쪽을 어둡게 가린다
    const hb = ctx.createLinearGradient(0, vh - 46, 0, vh);
    hb.addColorStop(0, 'rgba(0,0,0,0)'); hb.addColorStop(0.45, 'rgba(0,0,0,0.88)'); hb.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = hb; ctx.fillRect(0, vh - 46, vw, 46);
    text(ctx, input.touchMode ? '길게 눌러 빨리 넘기기' : 'Z 길게: 빨리 넘기기   Esc: 건너뛰기', vw - 16, vh - 12, { size: 11, align: 'right', color: '#8a7e76', ow: 0 });
  }
  drawStats(ctx, vw, vh, t) {
    const S = this.stats;
    const k = ease.outCubic(clamp(this.phaseT / 0.6, 0, 1));
    ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.globalAlpha = k;
    const w = Math.min(620, vw - 80), x = vw / 2 - w / 2, y = 60, h = 400;
    frame(ctx, x, y, w, h, { glow: 0.8, accent: this.E?.color ?? GOLD });
    text(ctx, 'YOUR JOURNEY', vw / 2, y + 40, { size: 26, align: 'center', weight: 900, family: FONT.logo, color: this.E?.color ?? GOLD, ow: 4 });
    const ch = CHARACTERS[S.charId];
    text(ctx, `${ch?.name ?? ''} · ${S.diff?.name ?? ''} 난이도`, vw / 2, y + 64, { size: 14, align: 'center', weight: 700, color: BONE, ow: 2 });
    ornament(ctx, vw / 2, y + 78, 300);
    S.rows.forEach(([a, b], i) => {
      const kk = clamp(this.phaseT * 4 - i * 0.35, 0, 1);
      const col = i % 2, row = Math.floor(i / 2);
      const xx = x + 30 + col * (w / 2 - 10), yy = y + 112 + row * 36;
      ctx.save(); ctx.globalAlpha *= kk;
      text(ctx, a, xx, yy, { size: 14, color: DIM, ow: 2 });
      text(ctx, b, xx + w / 2 - 60, yy, { size: 15, align: 'right', weight: 800, color: '#fff', ow: 2 });
      ctx.restore();
    });
    // 유물 5개 (보석)
    const rc = S.relics ?? 0, gy = y + h - 96;
    text(ctx, '드라큘라의 유물', vw / 2, gy - 18, { size: 12, align: 'center', weight: 700, color: DIM, ow: 2 });
    for (let i = 0; i < 5; i++) {
      const gx = vw / 2 + (i - 2) * 34, on = i < rc;
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(Math.PI / 4);
      if (on) { ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 12; }
      ctx.fillStyle = on ? '#c0102a' : 'rgba(255,255,255,0.06)'; ctx.fillRect(-8, -8, 16, 16);
      ctx.shadowBlur = 0; ctx.strokeStyle = on ? GOLD : 'rgba(232,200,114,0.3)'; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -8, 16, 16);
      if (on) { ctx.fillStyle = 'rgba(255,220,220,0.6)'; ctx.fillRect(-5, -5, 4, 4); }
      ctx.restore();
    }
    text(ctx, 'FINAL SCORE', x + 30, y + h - 36, { size: 15, weight: 900, family: FONT.num, color: DIM, ow: 2 });
    const sk = clamp((this.phaseT - 1.2) / 1.2, 0, 1);
    text(ctx, fmt(S.score * ease.outCubic(sk)), x + w - 30, y + h - 30, { size: 32, align: 'right', weight: 900, family: FONT.num, color: '#ffe070', ow: 4 });
    ctx.restore();
  }
  drawEnd(ctx, vw, vh, t) {
    const k = ease.outCubic(clamp(this.phaseT / 1.2, 0, 1));
    ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.globalAlpha = k;
    ctx.shadowColor = 'rgba(179,18,46,0.9)'; ctx.shadowBlur = 26;
    text(ctx, this.kind === 'bad' ? 'THE END…?' : 'THE END', vw / 2, vh * 0.34, { size: 56, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 6 });
    ctx.shadowBlur = 0;
    ornament(ctx, vw / 2, vh * 0.34 + 22, 380);
    const notes = this.fromEnding ? this.notes() : ['플레이해 주셔서 감사합니다'];
    notes.forEach((n, i) => text(ctx, n, vw / 2, vh * 0.34 + 66 + i * 28, { size: i === 0 ? 16 : 14, align: 'center', weight: i === 0 ? 800 : 600, color: i === 0 ? BONE : '#c8b8a8', ow: 3, maxWidth: vw - 80 }));
    if (this.phaseT > 1) text(ctx, input.touchMode ? '화면을 터치하세요' : 'Z / Enter 로 계속', vw / 2, vh - 36, { size: 14, align: 'center', color: `rgba(200,190,170,${0.5 + 0.4 * Math.sin(t * 4)})`, ow: 2 });
    ctx.restore();
  }
}
