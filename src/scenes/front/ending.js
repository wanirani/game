// 엔딩: 진행도로 배드/노멀/트루(1부) · 파수꾼의 밤/새벽의 별(2부) 판정 → 엔딩 제목 연출 → ending_* 컷신 → 크레딧 롤(슬라이드쇼 + 여정 통계 + 해금 안내)
// → (순위권이면) 이니셜 입력 → 1부 진엔딩: 2부 프롤로그(p2_prologue) → 마을 / 2부 엔딩·노멀·배드: 마을 / 그 밖: 타이틀
// world2 §2.2–2.3 (STORY-P2-A): ENDINGS p2·p2true, decideEnding 의 s20, 2부 크레딧 슬라이드·통계·안내, 진엔딩 뒤 2부 프롤로그, 2부 엔딩 뒤 마을
// 장면 플래그: uiScale (platform §6.2 — game.uiW × game.uiH 로 배치), hidePad
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saves } from '../../core/save.js';
import { text, font, FONT, bloodText, prewarmText } from '../../core/ui.js';
import { drawHints } from '../../core/prompts.js';
import { clamp, ease, fmt, rgba } from '../../core/math.js';
import * as STORY from '../../data/story.js';
import { CHARACTERS, CHAR_ORDER } from '../../data/characters.js';
import { BOSSES } from '../../data/bosses.js';
import { NPCS } from '../../data/npcs.js';
import { DOCS, DOC_ORDER } from '../../data/lore.js';
import { getDiff } from '../../data/difficulty.js';
import { Ambience, kenBurns, ornament, frame, gbutton, goSafe, qualifies, fmtPlay, TapZones, GOLD, BONE, DIM } from './common.js';

// name 은 ending_* 대사 끝의 '— ○○ END : 이름 —' 과 같아야 한다 (제목 카드·크레딧 달성 목록에 표시)
// bg 는 제목 카드와 엔딩 컷신의 기본 배경 (배드 엔딩은 밝은 여명 대신 붉은 달의 성). 재생하는 대사는 ending_<id>
export const ENDINGS = {
  bad: { id: 'bad', eng: 'BAD ENDING', name: '끝나지 않는 밤', color: '#ff4a5a', bg: 'cg/cg_bad_ending', music: 'sad', no: 'Ⅰ' },
  normal: { id: 'normal', eng: 'NORMAL ENDING', name: '백 년의 새벽', color: '#ffd070', bg: 'bg/ending', music: 'ending', no: 'Ⅱ' },
  true: { id: 'true', eng: 'TRUE ENDING', name: '영원한 새벽', color: '#fff2b0', bg: 'bg/ending', music: 'ending', no: 'Ⅲ' },
  p2: { id: 'p2', eng: 'PART Ⅱ ENDING', name: '파수꾼의 밤', color: '#b8a8ff', bg: 'cg/cg_p2_ending', music: 'ending', no: 'Ⅳ' },
  p2true: { id: 'p2true', eng: 'TRUE FINALE', name: '새벽의 별', color: '#fff6c8', bg: 'cg/cg_p2_true', music: 'ending', no: 'Ⅴ' },
};
const P2_KINDS = new Set(['p2', 'p2true']);
/** 2부 보스 (1부 엔딩의 통계는 1부 몫만 센다 — 2부를 아직 모르는 플레이어에게 "13 / 20" 처럼 보이지 않도록) */
const P2_BOSSES = new Set(['b_narkissa', 'b_moloch', 'b_dagon', 'b_ziz', 'b_mara', 'b_behemoth', 'b_nihil']);
const isP2Doc = (id) => Number(String(DOCS[id]?.stage ?? '').slice(1)) >= 14;
/** 2부를 아는가: 2부 엔딩 크레딧이거나, 2부 엔딩을 본 적이 있다 (data/story.js creditsFor 와 같은 규칙) */
function p2Known(kind, meta) {
  return P2_KINDS.has(kind) || !!meta?.endingsSeen?.some?.((k) => typeof k === 'string' && k.startsWith('p2'));
}

/** 진행도로 엔딩 종류 판정 (from 스테이지가 있으면 data/story.js endingAfter 규칙을 우선). null = 엔딩 아님(계속 진행) */
export function decideEnding(st, from = null) {
  if (from && typeof STORY.endingAfter === 'function') {
    const id = STORY.endingAfter(from, st);
    return id ? id.replace(/^ending_/, '') : null;
  }
  const p = st?.progress ?? {};
  // 2부 마지막 장(s20)을 깼으면 2부 엔딩: 별의 조각 6개 → 새벽의 별 (world2 §2.3)
  if (p.cleared?.s20) return (p.shards?.length ?? 0) >= 6 || p.flags?.stars_all ? 'p2true' : 'p2';
  if (p.cleared?.s13 || p.bosses?.includes('b_chaos') || p.flags?.boss_b_chaos) return 'true';
  const f = p.flags ?? {};
  if (f.carmilla_trust2 || f.carmilla_trust) return 'normal';
  return 'bad';
}

/** 배치 크기: uiScale 장면은 UI 좌표 (game.render 가 ctx.scale(uiK) 로 감싼다) */
function dims(sc) {
  const g = sc.game;
  return sc.uiScale && g.uiW ? [g.uiW, g.uiH] : [g.viewW, g.viewH];
}
/** 버튼 최소 높이 (platform §6.3: 44 CSS px) → 이 장면 좌표(px) */
function tapMin(sc) {
  const g = sc.game, k = (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1);
  return Math.max(44, Math.ceil(44 / Math.max(0.2, k)));
}

export class EndingScene extends Scene {
  enter({ kind = null, from = null } = {}) {
    this.hidePad = true;
    this.uiScale = true;
    const g = this.game, st = g.state;
    this.kind = ENDINGS[kind] ? kind : decideEnding(st, from);
    if (!ENDINGS[this.kind]) {
      // 유물을 모두 모은 채 드라큘라를 쓰러뜨림 → 엔딩 대신 심연의 문(13장)으로
      this.skip = true;
      if (from === 's12' && st?.progress && !st.progress.unlocked.includes('s13')) st.progress.unlocked.push('s13');
      goSafe(g, 'hub', { from }, { fadeTime: 0.8 });
      this.E = ENDINGS.normal; this.amb = new Ambience({ embers: 0, motes: 0, bats: 0, fog: false, lightning: false });
      return;
    }
    this.E = ENDINGS[this.kind];
    const m = g.meta;
    if (m) {
      if (!Array.isArray(m.endingsSeen)) m.endingsSeen = []; // 망가진·옛 메타 (배열이 아니면 .includes 에서 멈춘다)
      if (!m.endingsSeen.includes(this.kind)) m.endingsSeen.push(this.kind);
      m.clears = (m.clears ?? 0) + 1;
      saves.saveMeta(m);
    }
    if (st?.progress) {
      st.progress.flags['ending_' + this.kind] = true;   // ending_p2 · ending_p2true 는 2부 NPC 20장 대사가 읽는다
      st.progress.flags.endingSeen = this.kind;
      if (st.slot >= 1 && !st.arcade) saves.write(st.slot, st);
    }
    audio.stopMusic(1.2);
    this.amb = new Ambience({ embers: 50, motes: 30, bats: 0, fog: true, lightning: false, emberColor: this.kind === 'bad' ? '#ff4a3a' : this.kind === 'p2' ? '#c8b8ff' : '#ffd890' });
    assets.get(this.E.bg);
  }
  update(dt) {
    const [vw, vh] = dims(this);
    this.amb.update(dt, vw, vh);
    if (this.skip) return;
    if (this.t > 0.8 && !this.played) { this.played = true; audio.music(this.E.music); }
    const adv = this.t > 1.5 && (input.pressed('confirm') || input.pointer.tapped);
    if ((this.t > 5.2 || adv) && !this.went) {
      this.went = true;
      this.game.go('story', { script: `ending_${this.kind}`, bg: this.E.bg, then: 'credits', thenParams: { kind: this.kind, fromEnding: true } }, { fadeTime: 1.0 });
    }
  }
  render(ctx) {
    const g = this.game, [vw, vh] = dims(this), t = g.time;
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
    text(ctx, this.E.eng, vw / 2, vh / 2 - 8, { size: 46, align: 'center', weight: 900, family: FONT.logo, color: this.E.color, ow: 6, maxWidth: vw - 40 });
    ctx.shadowBlur = 0;
    ornament(ctx, vw / 2, vh / 2 + 14, Math.min(460, vw - 60) * k, { color: this.E.color });
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
/** 2부 세계 (2부 엔딩 크레딧·2부를 아는 플레이어의 크레딧에 이어 붙인다) */
const P2_SLIDES = ['bg/s14_mirror', 'bg/s15_forge', 'bg/s16_sunken', 'bg/s17_sky', 'bg/s18_nightmare', 'bg/s19_blight', 'bg/s20_void'];
const SLIDE_SEC = 7;
const LOGO_SUB = '블러드 녹턴 : 악마성 연대기';

/** 글자 폭이 maxW 를 넘으면 글자 크기를 줄인다 (가로로 짓눌리지 않도록; 결과는 캐시) */
const FIT = new Map();
function fitSize(ctx, str, size, weight, maxW, family = FONT.body) {
  const key = `${str}|${size}|${weight}|${Math.round(maxW)}`;
  let s = FIT.get(key);
  if (s === undefined) {
    ctx.save(); ctx.font = font(size, weight, family);
    const w = ctx.measureText(str).width;
    ctx.restore();
    s = w > maxW && w > 0 ? Math.max(12, Math.floor((size * maxW) / w)) : size;
    if (FIT.size > 500) FIT.clear();
    FIT.set(key, s);
  }
  return s;
}

export class CreditsScene extends Scene {
  enter({ kind = null, fromEnding = false, back = null } = {}) {
    this.hidePad = true;
    this.uiScale = true;
    const g = this.game;
    this.kind = kind; this.fromEnding = fromEnding; this.back = back;
    this.E = ENDINGS[kind] ?? null;
    this.p2 = p2Known(kind, g.meta);
    this.taps = new TapZones();
    const custom = typeof STORY.creditsFor === 'function' ? STORY.creditsFor(kind, g.state, g.meta) : STORY.CREDITS;
    this.blocks = Array.isArray(custom) && custom.length ? this.normalize(custom) : defaultCredits();
    const tail = kind === 'true' ? ['cg/cg_true_ending', 'bg/ending']
      : kind === 'bad' ? ['cg/cg_bad_ending']
        : kind === 'p2true' ? ['cg/cg_p2_true', 'bg/ending']
          : kind === 'p2' ? ['cg/cg_p2_ending']
            : ['cg/cg_castle_collapse', 'bg/ending'];
    this.slides = [...SLIDES, ...(this.p2 ? P2_SLIDES : []), ...tail];
    // 슬라이드는 지금·다음 두 장만 미리 받는다 (배경 한 장이 디코딩하면 약 10 MB — 전부 받으면 휴대폰 메모리 예산을 넘는다)
    this.slideAt = -1;
    this.prefetch(0);
    this.scroll = 150; this.phase = 'roll'; this.phaseT = 0;
    this.amb = new Ambience({ embers: 40, motes: 30, bats: 3, fog: false, lightning: false, emberColor: '#ffd890' });
    audio.music('credits');
    this.stats = fromEnding ? this.buildStats() : null;
    this.height = this.measure();
  }
  /** i 번째 슬라이드와 그다음 두 장을 받아 둔다 (바뀔 때만) */
  prefetch(i) {
    const n = this.slides.length;
    if (!n || i === this.slideAt) return;
    this.slideAt = i;
    for (let d = 0; d < 3; d++) assets.get(this.slides[(i + d) % n]);
  }
  normalize(list) {
    // data/story.js CREDITS: 문자열 배열('— 제목 —' 은 소제목, '' 은 간격) 또는 [{title|h, names|rows}] 형태 모두 허용
    // 문자열 배열의 첫 두 줄(로고·부제)은 로고 블록이 그린다 (부제는 creditsFor 가 2부 엔딩이면 바꾼다)
    if (list.every((x) => typeof x === 'string')) {
      const out = [{ logo: true }];
      let cur = null, i = 0;
      if (list[0] === 'BLOOD NOCTURNE') {
        i = 1;
        if (list[1] && !list[1].startsWith('—')) { out[0].sub = list[1]; i = 2; }
      }
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
    // 2부를 아는 플레이어는 전체(보스 20 · 비전서 27), 아니면 1부 몫(보스 13 · 비전서 20)만 센다
    const bossIds = Object.keys(BOSSES).filter((id) => this.p2 || !P2_BOSSES.has(id));
    const docIds = DOC_ORDER.filter((id) => this.p2 || !isP2Doc(id));
    const has = (arr, id) => Array.isArray(arr) && arr.includes(id);
    const p2Kind = P2_KINDS.has(this.kind);
    const rows = [
      ['총 플레이 시간', fmtPlay(s.playTime ?? 0)],
      ['쓰러뜨린 적', `${fmt(s.kills ?? 0)}`],
      ['격파한 보스', `${bossIds.filter((id) => has(p.bosses, id)).length} / ${bossIds.length}`],
      ['사망 횟수', `${s.deaths ?? 0}`],
      ['최대 콤보', `${s.maxCombo ?? 0} HITS`],
      ['비전서', `${docIds.filter((id) => has(p.docs, id)).length} / ${docIds.length}`],
      ['드라큘라의 유물', `${p.relics?.length ?? 0} / 5`],
      ['강화 기록', `성공 ${s.enhanceOk ?? 0} · 실패 ${s.enhanceFail ?? 0}`],
      ['벌어들인 골드', `${fmt(s.goldEarned ?? 0)} G`],
      ['최종 레벨', `Lv.${hero?.level ?? 1}`],
    ];
    const stars = Math.min(6, p.shards?.length ?? 0);
    if (p2Kind) rows.push(['별의 조각', `${stars} / 6`]);
    return {
      rows,
      score: st.score ?? 0, diff: getDiff(st.difficulty), charId: st.charId, relics: Math.min(5, p.relics?.length ?? 0),
      stars: p2Kind ? stars : null,
    };
  }
  /** 마지막 화면 안내: [달성 엔딩 수, 엔딩 이름 목록(모르는 것은 ???), 힌트·인사…] */
  notes() {
    const m = this.game.meta, out = [];
    const seen = Array.isArray(m?.endingsSeen) ? m.endingsSeen : [];
    const all = Object.keys(ENDINGS);
    out.push(`달성한 엔딩 ${all.filter((k) => seen.includes(k)).length} / ${all.length}`);
    out.push(all.map((k) => (seen.includes(k) ? ENDINGS[k].name : '???')).join(' · '));
    const K = this.kind;
    if (K === 'bad') out.push('힌트: 수수께끼의 귀부인을 믿어 보는 것은 어떨까…');
    if (K === 'bad' || K === 'normal') out.push('힌트: 드라큘라의 유물 다섯 개를 모두 모으고 백작을 쓰러뜨리면 심연의 문이 열린다');
    if (K === 'p2') out.push('힌트: 여섯 세계에 숨겨진 별의 조각을 모두 모으면 공허를 빛으로 채울 수 있다');
    if (K === 'true') out.push('모든 밤을 끝낸 전설의 헌터에게 경의를! 아케이드 모드에서 한계에 도전해 보세요');
    else if (K === 'p2true') out.push('일곱 세계에 새벽을 되찾은 전설의 헌터에게 경의를! 아케이드 모드에서 한계에 도전해 보세요');
    else out.push('아케이드 모드: 보스 러시 · 서바이벌 · 스테이지 연습에서 명예의 전당에 도전하세요');
    return out;
  }
  endRoll() {
    this.phase = this.stats ? 'stats' : 'end'; this.phaseT = 0; audio.sfx('menu_ok');
    // 통계·THE END 는 엔딩의 마지막 장면(슬라이드 끝)에 머문다 — 롤을 건너뛰어도 불타는 마을 같은 아무 장면이 아니라 그 엔딩의 그림 위에
    const n = this.slides.length, u = this.t / SLIDE_SEC;
    if (n) { this.hold = { at: this.t, from: Math.floor(u) % n, t0: (u % 1) * SLIDE_SEC + (Math.floor(u) % n) * 11 }; assets.get(this.slides[n - 1]); }
  }
  update(dt) {
    const [vw, vh] = dims(this);
    this.amb.update(dt, vw, vh);
    this.phaseT += dt;
    if (!this.hold) this.prefetch(Math.floor(this.t / SLIDE_SEC) % Math.max(1, this.slides.length));
    if (this.phase === 'roll') {
      if (this.taps.hit() === 'skip') { this.endRoll(); return; }
      const fast = input.down('confirm') || input.down('attack') || input.pointer.down;
      this.scroll += dt * (fast ? 190 : 46);
      if (input.pressed('menu') || input.pressed('cancel') || this.scroll > this.height + vh * 0.55) this.endRoll();
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
    const after = () => {
      if (!st) { g.go('title', {}); return; }
      if (this.kind === 'true') {
        // 1부 진엔딩 뒤: 진짜 세이브라면 2부 프롤로그 → 마을 (world2 §2.2). 이미 2부를 시작했거나 연습용 상태면 예전처럼 타이틀로
        const f = st.progress?.flags;
        if (st.slot >= 1 && !st.arcade && g.registry.story && STORY.SCRIPTS?.p2_prologue && f && !f.p2_started) {
          g.go('story', { script: 'p2_prologue', then: 'hub', thenParams: { from: 'p2' }, bg: 'cg/cg_rift_sky' });
          return;
        }
        g.go('title', {});
        return;
      }
      // 2부 엔딩 · 노멀 · 배드: 마을로 (2부 엔딩 뒤에도 이야기는 계속된다 — 20장 NPC 대사, 남은 의뢰, 별의 조각)
      goSafe(g, 'hub', { from: 'ending' });
    };
    const score = st?.score ?? 0;
    if (qualifies(g, 'story', score)) {
      g.push('initials', { score, mode: 'story', entry: { charId: st.charId, diff: st.difficulty, stageId: 'ending', ending: this.kind }, onDone: after });
    } else after();
  }
  render(ctx) {
    const g = this.game, [vw, vh] = dims(this), t = g.time;
    this.taps.clear();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, vw, vh);
    // 슬라이드쇼 (좌측, 7초 간격 크로스페이드). 롤이 끝나면 지금 장면에서 마지막 장면(엔딩 그림)으로 넘어가 머문다
    const per = SLIDE_SEC, n = this.slides.length, u = this.t / per;
    let i0 = Math.floor(u) % n, i1 = (i0 + 1) % n, f = clamp((u % 1 - 0.8) / 0.2, 0, 1);
    let t0 = (u % 1) * per + i0 * 11, t1 = i1 * 11;
    const H = this.hold;
    if (H) {
      const dt = this.t - H.at;
      i0 = H.from; i1 = n - 1; t0 = H.t0 + dt; t1 = i1 * 11 + dt;
      // 마지막 장면이 아직 안 받아졌으면 지금 장면에 머물다가, 받아진 뒤에 넘어간다 (검은 화면으로 사라지지 않게)
      if (H.ready == null && assets.get(this.slides[i1])) H.ready = this.t;
      f = i0 === i1 ? 0 : H.ready == null ? 0 : clamp((this.t - H.ready) / 1.2, 0, 1);
    }
    const sw = this.phase === 'roll' ? vw * 0.56 : vw;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, sw, vh); ctx.clip();
    if (f < 1) kenBurns(ctx, assets.get(this.slides[i0]), sw, vh, t0, { z0: 1.04, z1: 1.14, period: per * 2, alpha: 0.8 });
    if (f > 0) kenBurns(ctx, assets.get(this.slides[i1]), sw, vh, t1, { z0: 1.04, z1: 1.14, period: per * 2, alpha: f < 1 ? 0.8 * f : 0.8 });
    if (this.phase === 'roll') {
      const fr = ctx.createLinearGradient(sw * 0.5, 0, sw * 0.98, 0);
      fr.addColorStop(0, 'rgba(0,0,0,0)'); fr.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = fr; ctx.fillRect(0, 0, sw + 1, vh);
    }
    ctx.restore();
    if (this.phase === 'roll') {
      // 오른쪽 크레딧 영역: 은은한 진홍빛
      const rg = ctx.createRadialGradient(vw * 0.76, vh * 0.5, 20, vw * 0.76, vh * 0.5, vh * 0.7);
      rg.addColorStop(0, 'rgba(60,8,20,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, vw, vh);
    }
    const vg = ctx.createLinearGradient(0, 0, 0, vh);
    vg.addColorStop(0, 'rgba(0,0,0,0.7)'); vg.addColorStop(0.2, 'rgba(0,0,0,0)'); vg.addColorStop(0.8, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, vw, vh);
    this.amb.draw(ctx, vw, vh, 'front', t);
    // THE END 피 글씨는 처음 그릴 때 굽는 비용이 있어, 롤·통계가 도는 동안 미리 굽는다
    if (!this.warmed && this.phase !== 'end') { this.warmed = true; try { prewarmText(ctx, this.endTitle(), this.endOpts()); } catch { /* 무시 */ } }
    if (this.phase === 'roll') this.drawRoll(ctx, vw, vh, t);
    else if (this.phase === 'stats') this.drawStats(ctx, vw, vh, t);
    else this.drawEnd(ctx, vw, vh, t);
  }
  drawRoll(ctx, vw, vh, t) {
    const cx = vw * 0.72, nameMax = vw - cx - 16, centerMax = (vw - cx) * 2 - 30;
    let y = vh + 20 - this.scroll;
    for (const b of this.blocks) {
      if (b.logo) {
        if (y > -220 && y < vh + 40) {
          ctx.save(); ctx.shadowColor = 'rgba(179,18,46,0.9)'; ctx.shadowBlur = 20;
          text(ctx, 'BLOOD NOCTURNE', cx, y + 70, { size: 34, align: 'center', weight: 900, family: FONT.logo, color: GOLD, ow: 5, maxWidth: centerMax });
          ctx.restore();
          ornament(ctx, cx, y + 90, Math.min(320, centerMax));
          // 부제 (2부 엔딩이면 '… — 제2부 균열의 순례' → 두 줄)
          const [s1, s2] = String(b.sub ?? LOGO_SUB).split(' — ');
          text(ctx, s1, cx, y + 124, { size: 18, align: 'center', weight: 800, family: FONT.title, color: BONE, ow: 3, maxWidth: centerMax });
          if (s2) text(ctx, s2, cx, y + 150, { size: 15, align: 'center', weight: 800, family: FONT.title, color: '#d8c8ff', ow: 3, maxWidth: centerMax });
        }
        y += 200; continue;
      }
      if (y > -40 && y < vh + 40) text(ctx, b.h, cx, y + 20, { size: fitSize(ctx, b.h, 18, 900, centerMax, FONT.title), align: 'center', weight: 900, family: FONT.title, color: '#e8c872', ow: 3 });
      y += 60;
      for (const [role, name] of b.rows) {
        if (y > -40 && y < vh + 40) {
          if (role) {
            text(ctx, role, cx - 10, y, { size: 13, align: 'right', weight: 600, color: DIM, ow: 2, maxWidth: cx - 20 });
            text(ctx, name, cx + 10, y, { size: fitSize(ctx, name, 16, 800, nameMax), weight: 800, color: BONE, ow: 2, maxWidth: nameMax });
          } else text(ctx, name, cx, y, { size: fitSize(ctx, name, 16, 800, centerMax), align: 'center', weight: 800, color: BONE, ow: 2, maxWidth: centerMax });
        }
        y += 30;
      }
      y += 40;
    }
    // 하단 안내 띠: 올라오는 크레딧 줄이 안내 문구와 겹치지 않도록 아래쪽을 어둡게 가린다
    const hb = ctx.createLinearGradient(0, vh - 46, 0, vh);
    hb.addColorStop(0, 'rgba(0,0,0,0)'); hb.addColorStop(0.45, 'rgba(0,0,0,0.88)'); hb.addColorStop(1, 'rgba(0,0,0,0.96)');
    ctx.fillStyle = hb; ctx.fillRect(0, vh - 46, vw, 46);
    drawHints(ctx, [['confirm', '길게: 빨리 넘기기', '길게 눌러 빨리 넘기기'], input.touchMode ? null : ['menu', '건너뛰기']], vw - 16, vh - 12, { align: 'right', size: 11, color: '#8a7e76' });
    // 건너뛰기 버튼 (터치로도 롤을 끝낼 수 있게; 44 CSS px 이상)
    const bh = tapMin(this), bw = Math.max(116, bh * 2.4);
    gbutton(ctx, { x: vw - bw - 12, y: 8, w: bw, h: bh }, 'SKIP ▶▶', { size: 13, zones: this.taps, id: 'skip' });
  }
  drawStats(ctx, vw, vh, t) {
    const S = this.stats;
    const k = ease.outCubic(clamp(this.phaseT / 0.6, 0, 1));
    ctx.fillStyle = `rgba(0,0,0,${0.55 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.globalAlpha = k;
    const w = Math.min(620, vw - 40), h = Math.min(400, vh - 20);
    const x = vw / 2 - w / 2, y = Math.max(10, (vh - h) / 2);
    const accent = this.E?.color ?? GOLD;
    frame(ctx, x, y, w, h, { glow: 0.8, accent });
    text(ctx, 'YOUR JOURNEY', vw / 2, y + 40, { size: 26, align: 'center', weight: 900, family: FONT.logo, color: accent, ow: 4 });
    const ch = CHARACTERS[S.charId];
    text(ctx, `${ch?.name ?? ''} · ${S.diff?.name ?? ''} 난이도`, vw / 2, y + 64, { size: 14, align: 'center', weight: 700, color: BONE, ow: 2 });
    ornament(ctx, vw / 2, y + 78, 300);
    // 두 칸 표: 행이 늘어도 (2부 엔딩은 11칸) 아래 보석 줄과 겹치지 않도록 줄 간격을 맞춘다
    const lines = Math.ceil(S.rows.length / 2);
    const rowH = lines > 1 ? Math.min(36, (h - 250) / (lines - 1)) : 36;
    S.rows.forEach(([a, b], i) => {
      const kk = clamp(this.phaseT * 4 - i * 0.35, 0, 1);
      const col = i % 2, row = Math.floor(i / 2);
      const xx = x + 30 + col * (w / 2 - 10), yy = y + 112 + row * rowH;
      ctx.save(); ctx.globalAlpha *= kk;
      text(ctx, a, xx, yy, { size: 14, color: DIM, ow: 2 });
      text(ctx, b, xx + w / 2 - 60, yy, { size: 15, align: 'right', weight: 800, color: '#fff', ow: 2 });
      ctx.restore();
    });
    // 보석 줄: 드라큘라의 유물 5개 (+ 2부 엔딩이면 별의 조각 6개)
    const gy = y + h - 92;
    if (S.stars != null) {
      this.drawGems(ctx, vw / 2 - w / 4, gy, 5, S.relics, '드라큘라의 유물', 'relic');
      this.drawGems(ctx, vw / 2 + w / 4, gy, 6, S.stars, '별의 조각', 'star');
    } else this.drawGems(ctx, vw / 2, gy, 5, S.relics, '드라큘라의 유물', 'relic');
    text(ctx, 'FINAL SCORE', x + 30, y + h - 36, { size: 15, weight: 900, family: FONT.num, color: DIM, ow: 2 });
    const sk = clamp((this.phaseT - 1.2) / 1.2, 0, 1);
    text(ctx, fmt(S.score * ease.outCubic(sk)), x + w - 30, y + h - 30, { size: 32, align: 'right', weight: 900, family: FONT.num, color: '#ffe070', ow: 4 });
    ctx.restore();
  }
  /** 보석 n 개 (가운데 cx), on 개는 빛난다. kind 'relic' = 붉은 마름모, 'star' = 새벽빛 별 */
  drawGems(ctx, cx, gy, n, on, label, kind) {
    text(ctx, label, cx, gy - 18, { size: 12, align: 'center', weight: 700, color: DIM, ow: 2 });
    for (let i = 0; i < n; i++) {
      const gx = cx + (i - (n - 1) / 2) * 30, lit = i < on;
      ctx.save(); ctx.translate(gx, gy);
      if (kind === 'star') {
        ctx.beginPath();
        for (let j = 0; j < 8; j++) {
          const r = j % 2 ? 3.6 : 10, a = (j / 8) * Math.PI * 2 - Math.PI / 2;
          if (j) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        if (lit) { ctx.shadowColor = '#fff6c8'; ctx.shadowBlur = 12; }
        ctx.fillStyle = lit ? '#fff0b0' : 'rgba(255,255,255,0.06)'; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = lit ? '#fffbe8' : 'rgba(232,200,114,0.3)'; ctx.lineWidth = 1.2; ctx.stroke();
      } else {
        ctx.rotate(Math.PI / 4);
        if (lit) { ctx.shadowColor = '#ff2040'; ctx.shadowBlur = 12; }
        ctx.fillStyle = lit ? '#c0102a' : 'rgba(255,255,255,0.06)'; ctx.fillRect(-8, -8, 16, 16);
        ctx.shadowBlur = 0; ctx.strokeStyle = lit ? GOLD : 'rgba(232,200,114,0.3)'; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -8, 16, 16);
        if (lit) { ctx.fillStyle = 'rgba(255,220,220,0.6)'; ctx.fillRect(-5, -5, 4, 4); }
      }
      ctx.restore();
    }
  }
  endTitle() { return this.kind === 'bad' ? 'THE END…?' : 'THE END'; }
  endOpts() {
    // 진엔딩(영원한 새벽·새벽의 별)은 금박, 그 밖은 피 글씨. 바로 아래 안내 문구가 있으니 핏방울은 줄인다
    const gold = this.kind === 'true' || this.kind === 'p2true';
    return { size: 56, style: gold ? 'gold' : 'blood', drips: gold ? 0 : 0.4, align: 'center' };
  }
  drawEnd(ctx, vw, vh, t) {
    const k = ease.outCubic(clamp(this.phaseT / 1.2, 0, 1));
    ctx.fillStyle = `rgba(0,0,0,${0.5 * k})`; ctx.fillRect(0, 0, vw, vh);
    ctx.save(); ctx.globalAlpha = k;
    const ty = vh * 0.34;
    bloodText(ctx, this.endTitle(), vw / 2, ty, { ...this.endOpts(), t: this.phaseT, maxWidth: vw - 60 });
    ornament(ctx, vw / 2, ty + 22, Math.min(380, vw - 80));
    const notes = this.fromEnding ? this.notes() : ['플레이해 주셔서 감사합니다'];
    notes.forEach((n, i) => text(ctx, n, vw / 2, ty + 66 + i * 28, { size: i === 0 ? 16 : 14, align: 'center', weight: i === 0 ? 800 : 600, color: i === 0 ? BONE : i === 1 && this.fromEnding ? '#e0d0b8' : '#c8b8a8', ow: 3, maxWidth: vw - 60 }));
    if (this.phaseT > 1) {
      ctx.globalAlpha = k * (0.55 + 0.4 * Math.sin(t * 4));
      drawHints(ctx, [['confirm', '계속', '화면을 터치하세요']], vw / 2, vh - 36, { align: 'center', size: 14, color: 'rgb(200,190,170)' });
    }
    ctx.restore();
  }
}
