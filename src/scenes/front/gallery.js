// 회랑 「GALLERY」 'gallery' (docs/specs/gallery.md §5) — owner: GAL-UI
//  - 여는 곳: 타이틀 메뉴 8번째 줄 '회랑' → go('gallery', {back:'title', backIndex}) · 성당 「여정 기록」 '회랑에서 돌아본다' → push('gallery', {})
//    (push 면 극장이 꺼진다 — 다시 보기는 go 라 마을 장면 스택을 지운다). 선택 인자 room: 'cg'|'music'|'theater'.
//    닫기: back:'title' 이면 타이틀 메뉴의 회랑 줄로, 아니면 pop()
//  - 방 셋: 그림(썸네일 격자 → 크게 보기) · 음악(사운드 테스트 + 시각화) · 극장(서막 둘·엔딩 다섯·크레딧 — front/story.js 의 replay)
//  - 데이터: 엔진 game.gal (§3.2 list·rescan·markSeen·rev)만 쓴다. 엔진이 없으면(받지 못함) data/gallery.js 만으로 그리고 모두 잠김
//    ('always' 곡·크레딧만 열림, 2부 항목은 숨김) + 내용 위 '회랑 정보를 불러오지 못했습니다' 한 줄 — 던지지 않는다.
//    목록은 열 때와 엔진 rev 가 바뀔 때만 다시 읽는다 (매 프레임 엔진을 부르지 않는다)
//  - 메모리 (§5.8): 썸네일은 아틀라스 캔버스 한 장(6 × 6 칸, lean ≤ 1200×624 ≈ 3.0 MB · high ≤ 1536×798 ≈ 4.9 MB)에 굽는다 —
//    그림 방이 보이는 동안 보이는 카드부터, 받기는 휴대폰 한 번에 하나(데스크톱 둘), 굽기는 프레임당 한 장, 구운 원본은 곧바로 놓는다.
//    잠긴 그림은 받지 않는다(스포일러·메모리). 크게 보기는 지금·다음 두 장만 디코딩하고 그동안 굽기를 멈춘다 (assets 가 휴대폰·저사양에
//    lo 변형을 고른다). 데이터 절약(saveData)이면 썸네일 대신 이름 카드, 크게 볼 때만 받는다.
//    들어올 때 이미 캐시에 있던 cg/ 키(성당 배경 cg/cg_alberto_church 등)는 놓지 않는다
//  - 음악실 (§5.4): 고르기 = 선택만 · confirm/줄 탭 = 재생(같은 곡이면 처음부터) · alt/[정지] · ←→/[이전 곡][다음 곡] = 이웃 열린 곡을
//    고르고 0.35초 뒤 재생 (빨리 넘겨도 녹음 곡 풀기가 쌓이지 않게). 배지 = audio.recStats() (0.25초마다). 시각화 = audio.analyser() 의
//    주파수 32칸 (음악실에 있을 때만 붙이고 나가면 뗀다), 없으면 곡 박자(bpm)에 맞춘 결정적 막대 (게임 난수 금지).
//    회랑은 설정(음원·음량)을 바꾸지 않고 prefetch 도 부르지 않는다. keepAwake 는 음악실에서 곡이 도는 동안만
//  - 배치 (§5.2): 넓은(uiW ≥ 960 · uiH ≥ 500) = 머리 64 · 방 칩 · 내용 · 바닥 안내 / 좁은(휴대폰) = 머리 52 · 칩 · 내용(음악실은 아래
//    '지금 재생' 띠 60). 칩·단추 'primary'(44 UI px + 이웃과 9 UI px 이상 → 터치 여유로 44 CSS px), 카드·줄 'list'(≥ 36 CSS px) — src 'gal.*'
//  - 조작 (§5.6, 의미 액션만): prevTab/nextTab 방(돌아감) · 방향키 고르기 · confirm 보기/재생 · alt 맞춤 토글(크게 보기)/정지(음악실) ·
//    cancel 닫기. 터치: 칩·카드·줄 탭(바로 연다/재생), 끌기 스크롤, 가로 밀기 = 방 바꾸기 (크게 보기: 밀기 = 넘기기 · 탭 = 덮개 ·
//    두 번 탭 = 맞춤 · 양옆 화살 단추). 마우스: 올리면 고르기 · 누르면 연다 · 휠 (크게 보기: 휠 = 넘기기)
//  - 나가면 (§5.1): game.gal.markSeen() · 아틀라스·배경 레이어를 풀로 · 회랑이 받은 CG 놓기 · analyser 떼기 · push 였으면 들어올 때의 곡으로
//    (go 로 들어오면 'title' 을 튼다 — 다시 보기·크레딧에서 돌아와도). 그리기: 프레임마다 새 캔버스·그라디언트 0
import { Scene } from '../../core/game.js';
import { input } from '../../core/input.js';
import { audio } from '../../core/audio.js';
import { assets } from '../../core/assets.js';
import { saveDataOn } from '../../core/audio_rec.js';
import { text, FONT, taps, fontEpoch, textFloor } from '../../core/ui.js';
import { promptMode } from '../../core/prompts.js';
import { clamp, ease, TAU } from '../../core/math.js';
import { hudSafe } from '../../render/hud_layout.js';
import { TRACKS } from '../../data/music.js';
import { CHARACTERS } from '../../data/characters.js';
import * as GD from '../../data/gallery.js';
import { ENDINGS } from './ending.js';
import { Ambience, kenBurns, shade, heading as bigHeading, backButton, footer, GOLD, BONE, DIM } from './common.js';
import {
  PAL, Nav, Gesture, Scroller, scrollbar, clipBegin, clipEnd, zone, glyph, selBar, frame, gbutton, ellipsize,
  Layer, leanMem, ctxScale, vGrad, fillGradRect, inRect, diamond, divider, brackets, takeCanvas, giveCanvas, pill,
} from '../menu/common.js';
import { decoOf, decoAmbience, drawDecoMoon } from '../title.js';

const ROOMS = [
  { id: 'cg', kind: 'cg', name: '그림' },
  { id: 'music', kind: 'mus', name: '음악' },
  { id: 'theater', kind: 'th', name: '극장' },
];
const TITLE_INDEX = 7;   // 타이틀 메뉴의 '회랑' 줄 (title.js buildMenu: … 계정 · 설정 · 회랑)
const ERR_LINE = '회랑 정보를 불러오지 못했습니다';
const EMPTY_LINE = '아직 걸린 그림이 없습니다 — 이야기를 진행하면 하나씩 걸립니다';
const TH_OFF_LINE = '타이틀 화면의 회랑에서 볼 수 있습니다';
const TH_LOCK_END = '아직 보지 못한 엔딩입니다';
const LOAD_FAIL = '그림을 불러오지 못했습니다';
const VOL0_LINE = '음악 음량이 0입니다 — 설정에서 올리면 들을 수 있습니다';
const PART_NAME = { 1: '제1부 「드라큘라의 성」', 2: '제2부 「균열의 순례」', aw: '각성' };   // data/gallery.js GAL_PARTS 가 있으면 그것
const PART_SHORT = { 1: '제1부', 2: '제2부', aw: '각성' };
const PARTS = [1, 2, 'aw'];
// 음악 칸 이름 (data/gallery.js GAL_MUSIC_SECS 가 있으면 그것)
const SEC_NAME = { story: '이야기와 마을', p1: '제1부', p2: '제2부', boss: '보스', inter: '막간' };
const nameIn = (list, id) => (Array.isArray(list) ? list.find((x) => x?.id === id)?.name : null);
const partName = (p) => nameIn(GD.GAL_PARTS, p) ?? PART_NAME[p] ?? '';
const secName = (id) => nameIn(GD.GAL_MUSIC_SECS, id) ?? (own(SEC_NAME, id) ? SEC_NAME[id] : typeof id === 'string' ? id : '');
// 극장 줄의 기본값 (데이터에 bg·music·name·sub 가 없을 때, §4.3)
const TH_DEF = {
  prologue: { name: '서막', sub: 'PROLOGUE', bg: 'cg/cg_prologue_moon', music: 'prologue' },
  p2_prologue: { name: '제2부 서막', sub: 'PART Ⅱ', bg: 'cg/cg_rift_sky' },
  credits: { name: '크레딧', sub: 'CREDITS' },
};
const ASPECT = 1.92;       // 썸네일 가로세로비 (CG 1912×999 ≈ 1.91 · 컷인 1600×637 은 얼굴 쪽을 잘라 쓴다)
const CUTIN_FACE = [0.62, 0.42];   // 컷인 일러스트의 얼굴 중심 (data/awaken.js AWAKEN[*].face 의 대표값 — 데이터를 싣지 않으려고 여기 둔다)
const CELLS = 6;           // 아틀라스 6 × 6 칸 (그림 34장)
const NEW_C = '#ff3050';
const NEXT_DELAY = 0.35;   // ←→ 로 곡을 넘길 때 재생까지 (§5.4)
const OVERLAY_SEC = 3;     // 크게 보기 덮개가 저절로 숨기까지 (§5.3)
const BARS = 32;
const LOCK_G = [0, 'rgba(30,16,26,0.95)', 1, 'rgba(10,5,10,0.95)'];
const NAME_G = [0, 'rgba(70,14,30,0.92)', 0.6, 'rgba(30,8,18,0.94)', 1, 'rgba(12,4,10,0.96)'];
const OV_TOP = [0, 'rgba(0,0,0,0.82)', 1, 'rgba(0,0,0,0)'];
const BAR_G = [0, '#ffd8a0', 0.45, '#e0304a', 1, '#5a0818'];
const BAND_G = [0, 'rgba(20,8,20,0.94)', 1, 'rgba(6,2,8,0.97)'];
let FIT_COVER = false;     // 크게 보기 맞춤(contain) ↔ 가득 채움(cover) — 이번 실행 동안 기억 (§5.3)

const own = (o, k) => typeof k === 'string' && !!o && Object.hasOwn(o, k);
const safe = (fn, d = undefined) => { try { return fn(); } catch (e) { console.warn('[gal-ui]', e); return d; } };
const cgKey = (id) => `cg/${id}`;
/** 'm:ss' (같은 초면 같은 문자열 — 프레임마다 새 글을 만들지 않는다) */
const CLOCK = new Map();
function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  let v = CLOCK.get(s);
  if (v === undefined) { if (CLOCK.size > 400) CLOCK.clear(); v = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; CLOCK.set(s, v); }
  return v;
}
/** 곡 id 의 결정적 해시 (박자 막대 — 게임 난수를 쓰지 않는다) */
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function hash01(h, i) {
  let x = (h ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// 잘라 쓴 글 캐시 (매 프레임 measureText 반복을 피한다; 글꼴 세대·글자 하한도 키에)
const FIT = new Map();
function fit(ctx, str, w, size, weight = 500, family = FONT.body) {
  const k = size + '|' + weight + '|' + Math.round(w) + '|' + family.length + '|' + fontEpoch + '|' + textFloor() + '|' + str;
  let v = FIT.get(k);
  if (v === undefined) {
    if (FIT.size > 600) FIT.clear();
    v = w > 8 ? ellipsize(ctx, str, w, size, weight, family) : '';
    FIT.set(k, v);
  }
  return v;
}
/**
 * 스크롤 영역 안의 탭 영역: 보이는 부분만 등록한다 (achievements.js 와 같은 규칙). 보이는 크기가 kind 의 최소(min, UI px)보다 작으면
 * 등록하지 않고 가려진 것으로만 표시 — 반쯤 보이는 줄의 온전한 사각형이 아래 단추와 겹치지 않게
 */
function clipZone(r, clip, kind, owner, src, min) {
  const x0 = Math.max(r.x, clip.x), y0 = Math.max(r.y, clip.y), x1 = Math.min(r.x + r.w, clip.x + clip.w), y1 = Math.min(r.y + r.h, clip.y + clip.h);
  const v = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const cutW = v.w < r.w - 0.01, cutH = v.h < r.h - 0.01;
  const small = (cutH && v.h < min - 0.01) || (kind !== 'list' && cutW && v.w < min - 0.01);
  if (!owner || v.w <= 0 || v.h <= 0 || small) { v.tzo = owner; v.thid = true; return v; }
  return zone(v, kind, owner, { src });
}

// ───────────────────────── 줄 모양 ─────────────────────────
/** 그림 줄. 컷인은 영웅 이름 + 작은 줄 '각성 — {각성기 이름}' (데이터의 name · sub — 기존 문장, §4.1) */
function cgRow(r) {
  const d = r.def, id = d.id;
  const hero = typeof d.hero === 'string' ? d.hero : id.startsWith('cutin_') ? id.slice(6) : null;
  const name = typeof d.name === 'string' && d.name ? d.name : hero && own(CHARACTERS, hero) ? CHARACTERS[hero].name : id;
  const part = d.part === 'aw' || (hero && d.part == null) ? 'aw' : Number(d.part) === 2 ? 2 : 1;
  return {
    kind: 'cg', id, def: d, open: !!r.open, isNew: !!r.isNew, key: typeof d.key === 'string' ? d.key : cgKey(id), name,
    sub: typeof d.sub === 'string' ? d.sub : '', at: typeof d.at === 'string' ? d.at : '', part, cell: -1, face: hero ? CUTIN_FACE : null,
  };
}
/** 음악 줄 (이름은 TRACKS[id].name 그대로) */
function musRow(r) {
  const d = r.def, id = d.id, T = own(TRACKS, id) ? TRACKS[id] : null;
  const sec = secName(d.sec);
  return { kind: 'mus', id, def: d, open: !!r.open, isNew: !!r.isNew, name: T?.name ?? id, sec, loop: T?.loop !== false, bpm: clamp(Number(T?.bpm) || 100, 40, 220), hash: hashStr(id), no: '' };
}
/** 극장 줄: 엔딩은 'ENDING Ⅰ' · '「{ENDINGS[k].name}」' (기존 문장, §4.3) */
function thRow(r) {
  const d = r.def, id = d.id;
  const k = typeof d.ending === 'string' ? d.ending : id.startsWith('end_') ? id.slice(4) : null;
  const E = k && own(ENDINGS, k) ? ENDINGS[k] : null;
  const P = own(TH_DEF, id) ? TH_DEF[id] : {};
  return {
    kind: 'th', id, def: d, open: !!r.open, isNew: false,
    name: E ? `「${E.name}」` : typeof d.name === 'string' ? d.name : P.name ?? id,
    sub: E ? `ENDING ${E.no}` : typeof d.sub === 'string' ? d.sub : P.sub ?? '',
    ending: E ? k : null, credits: !E && (id === 'credits' || d.kind === 'credits'),
  };
}
/** 엔진이 없을 때: 데이터만으로 (always 만 열림, 2부 항목은 숨김 — §5.1) */
function fallbackList(kind) {
  const arr = kind === 'cg' ? GD.GAL_CG : kind === 'mus' ? GD.GAL_MUSIC : GD.GAL_THEATER;
  return (Array.isArray(arr) ? arr : []).map((def) => ({ def, open: Array.isArray(def?.need) && def.need.includes('always'), isNew: false, hidden: !!def?.p2 }));
}

export class GalleryScene extends Scene {
  constructor(g) { super(g); this.uiScale = true; this.hidePad = true; this.opaque = true; }

  enter(params = {}) {
    const g = this.game;
    this.back = params.back === 'title' ? 'title' : null;
    this.backIndex = Number.isInteger(params.backIndex) ? params.backIndex : TITLE_INDEX;
    this.pushed = g.scenes[0] !== this;   // push(성당): 극장 꺼짐 · 닫으면 pop · 들어올 때의 곡으로
    this.prevMusic = audio.current;
    this.nav = new Nav(); this.ges = new Gesture();
    this.scs = [new Scroller(), new Scroller(), new Scroller()];
    this.bgLayer = new Layer();
    this.ri = Math.max(0, ROOMS.findIndex((r) => r.id === params.room));
    this.sel = [0, 0, 0];
    this.viewer = null; this.atlas = null; this.msg = null;
    this.zChips = []; this.zItems = []; this.zBtns = {}; this.visCg = [];
    this.ready = []; this.loading = 0;
    this.alive = true; this.pollT = 0; this.recT = 0; this.rec = null; this._L = null; this.geo = null; this.geoKey = '';
    this.roomT = -1; this.devK = 1;
    // 들어올 때 이미 캐시에 있던 cg/ 키는 놓지 않는다 (성당 배경 등, §5.1)
    this.cached0 = new Set();
    for (const k of assets.cache?.keys?.() ?? []) if (typeof k === 'string' && k.startsWith('cg/')) this.cached0.add(k);
    this.loaded = new Set();   // 회랑이 받은 cg/ 키 (나갈 때 놓는다)
    this.saveData = !!safe(() => saveDataOn(), false);
    this.play = { id: null, at: null };   // 지금 곡 · 재생을 본 audio.ctx 시각 (재생 시간 = ctx.currentTime − at)
    this.pend = null;                     // ←→ 로 고른 곡 {id, t}
    this.fft = new Uint8Array(BARS); this.bars = new Float32Array(BARS); this.an = null; this.anT = 0;
    this.keepAwake = false; this.deferToasts = false;
    const G = this.api();
    if (G) safe(() => G.rescan?.('open'));   // §3.4 회랑을 열 때 같은 프레임에 (캐시 + 지금 game.state)
    this.refresh();
    if (!this.pushed) audio.music('title');
    this.makeAmb();
    this._onWheel = (e) => { if (this.game.top === this) this.ges.addWheel(e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1) * 0.9); };
    try { window.addEventListener('wheel', this._onWheel, { passive: true }); } catch { /* 창 없음 */ }
  }
  exit() {
    this.alive = false;
    try { window.removeEventListener('wheel', this._onWheel); } catch { /* 무시 */ }
    safe(() => this.game.gal?.markSeen?.());   // NEW 표시를 지운다 (§3.2)
    this.viewer = null; this.deferToasts = false; this.keepAwake = false;
    if (this.atlas) { giveCanvas(this.atlas.cv); this.atlas = null; }
    this.bgLayer?.free();
    for (const k of [...this.loaded]) this.drop(k);
    this.ready.length = 0;
    if (this.an) { safe(() => audio.analyser?.(false)); this.an = null; }
    if (this.pushed) {   // 성당: 들어올 때의 곡으로 (음악실에서 다른 곡을 틀었어도)
      if (this.prevMusic) audio.music(this.prevMusic, { fade: 0.6 }); else audio.stopMusic(0.6);
    }
  }

  // ───────────────────────── 데이터 ─────────────────────────
  api() { const G = this.game.gal; return G && typeof G.list === 'function' ? G : null; }
  refresh() {
    const G = this.api();
    this.noEngine = !G; this.err = !G;
    const get = (kind) => {
      let L = G ? safe(() => G.list(kind), null) : null;
      if (!Array.isArray(L)) { if (G) this.err = true; L = fallbackList(kind); }
      return L.filter((r) => r && r.def && typeof r.def.id === 'string' && !r.hidden);
    };
    this.rows = { cg: get('cg').map(cgRow), mus: get('mus').map(musRow), th: get('th').map(thRow) };
    // 아틀라스 칸 = 데이터 순서 (숨김·열림이 바뀌어도 같은 칸)
    const defs = Array.isArray(G?.defs?.cg) ? G.defs.cg : Array.isArray(GD.GAL_CG) ? GD.GAL_CG : [];
    const at = new Map(defs.map((d, k) => [d?.id, k]));
    for (const r of this.rows.cg) { const k = at.get(r.id) ?? -1; r.cell = k >= 0 && k < CELLS * CELLS ? k : -1; }
    // 곡 번호 = 보이는 목록의 순서 (2부를 숨기면 다시 매긴다 — 빈 번호가 2부를 알리지 않게, §4.2)
    this.rows.mus.forEach((r, i) => { r.no = `No.${String(i + 1).padStart(2, '0')}`; });
    this.openCg = this.rows.cg.filter((r) => r.open);
    const cnt = (L) => ({ got: L.filter((r) => r.open).length, total: L.length });
    this.sum = { cg: cnt(this.rows.cg), mus: cnt(this.rows.mus), th: cnt(this.rows.th) };
    this.sum.txt = `그림 ${this.sum.cg.got} / ${this.sum.cg.total} · 음악 ${this.sum.mus.got} / ${this.sum.mus.total}`;
    this.roomNew = [this.rows.cg.some((r) => r.isNew), this.rows.mus.some((r) => r.isNew), false];
    ['cg', 'mus', 'th'].forEach((k, i) => { this.sel[i] = clamp(this.sel[i] ?? 0, 0, Math.max(0, this.rows[k].length - 1)); });
    if (this.viewer && !this.openCg[this.viewer.vi]) this.viewer.vi = clamp(this.viewer.vi, 0, Math.max(0, this.openCg.length - 1));
    this.rev = G ? safe(() => G.rev, null) : null;
    this.geoKey = '';
    this.game.dirty = true;
  }
  makeAmb() {
    const g = this.game, q = g.tier === 'low' ? 0.5 : g.tier === 'medium' ? 0.75 : 1;
    const deco = decoOf(g.meta);
    // 불씨는 타이틀의 절반 (안개·번개 없음), 고른 타이틀 장식 색을 따른다
    this.amb = new Ambience(decoAmbience({ embers: Math.round(35 * q), motes: Math.round(12 * q), bats: Math.round(7 * q), fog: false, lightning: false }, deco));
    this.moon = !!deco?.amb?.moon;
  }
  note(str, color = PAL.goldHi, time = 2.4) { this.msg = { text: str, color, t: time }; }
  get room() { return ROOMS[this.ri].id; }
  setRoom(k) {
    const ni = ((k % ROOMS.length) + ROOMS.length) % ROOMS.length;
    if (ni === this.ri) return;
    this.ri = ni; this.roomT = this.t;
    this.scs[ni].follow(this.sel[ni]);
    audio.sfx('menu_move');
  }
  leave() {
    audio.sfx('menu_cancel');
    const g = this.game;
    if (this.back === 'title') g.go('title', { menu: true, index: this.backIndex });
    else g.pop();
  }
  /** 이 키를 놓아도 되면 놓는다 (들어올 때 캐시에 있던 것 · 크게 보기가 쓰는 것은 그대로) */
  drop(key) {
    if (!key || this.cached0.has(key) || this.viewer?.keys.has(key)) return;
    if (this.loaded.has(key)) { this.loaded.delete(key); safe(() => assets.release(key)); }
  }
  /** 받기 (회랑이 처음 받은 키만 나중에 놓는다) */
  want(key) {
    if (!this.cached0.has(key) && !assets.cache?.has?.(key)) this.loaded.add(key);
    return assets.load(key);
  }

  // ───────────────────────── 썸네일 아틀라스 (§5.8) ─────────────────────────
  ensureAtlas() {
    if (this.atlas) return this.atlas;
    const L = this._L;
    if (!L) return null;
    const G = this.geoOf(L, 'cg');
    const cw = clamp(Math.round(G.cw * (this.devK || 1)), 160, leanMem(this.game) ? 200 : 256), ch = Math.round(cw / ASPECT);
    const cv = takeCanvas();
    cv.width = cw * CELLS; cv.height = ch * CELLS;
    const ctx = cv.getContext('2d');
    if (!ctx) { giveCanvas(cv); return null; }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium';
    this.atlas = { cv, ctx, cw, ch, state: new Uint8Array(CELLS * CELLS) };   // 0 없음 · 1 받는 중 · 2 구움 · 3 실패
    return this.atlas;
  }
  get fitCover() { return FIT_COVER; }   // QA: 크게 보기 맞춤 상태
  get atlasBytes() { return this.atlas ? this.atlas.cv.width * this.atlas.cv.height * 4 : 0; }
  bakeTick() {
    if (this.saveData || this.viewer || this.ri !== 0 || !this.openCg.length) return;
    const A = this.ensureAtlas();
    if (!A) return;
    const job = this.ready.shift();
    if (job) this.bakeOne(A, job);
    if (this.loading >= (leanMem(this.game) ? 1 : 2)) return;
    let pick = null;
    for (const k of this.visCg) { const r = this.rows.cg[k]; if (r?.open && r.cell >= 0 && !A.state[r.cell]) { pick = r; break; } }
    if (!pick) for (const r of this.openCg) if (r.cell >= 0 && !A.state[r.cell]) { pick = r; break; }
    if (!pick) return;
    A.state[pick.cell] = 1; this.loading++;
    const key = pick.key;
    const done = (img) => {
      this.loading = Math.max(0, this.loading - 1);
      if (!this.alive || this.atlas !== A) { this.drop(key); return; }
      if (this.viewer) { A.state[pick.cell] = 0; this.drop(key); return; }   // 크게 보기 중에는 디코딩 CG ≤ 2장 — 나중에 다시
      this.ready.push({ r: pick, key, img });
    };
    // 미리 디코딩해 두면 굽기(drawImage)가 메인 스레드에서 풀지 않는다
    Promise.resolve(this.want(key)).then((img) => (img && typeof img.decode === 'function' ? img.decode().then(() => img, () => img) : img))
      .then(done, () => done(null));
  }
  bakeOne(A, { r, key, img }) {
    const iw = img?.naturalWidth || img?.width || 0, ih = img?.naturalHeight || img?.height || 0;
    if (iw > 4 && ih > 4) {
      let sw = iw, sh = Math.round(iw / ASPECT);
      if (sh > ih) { sh = ih; sw = Math.round(ih * ASPECT); }
      const fx = r.face ? r.face[0] : 0.5, fy = r.face ? r.face[1] : 0.5;   // 컷인은 얼굴 쪽으로 자른다
      const sx = clamp(Math.round(iw * fx - sw / 2), 0, iw - sw), sy = clamp(Math.round(ih * fy - sh / 2), 0, ih - sh);
      try {
        A.ctx.drawImage(img, sx, sy, sw, sh, (r.cell % CELLS) * A.cw, Math.floor(r.cell / CELLS) * A.ch, A.cw, A.ch);
        A.state[r.cell] = 2;
      } catch { A.state[r.cell] = 3; }
    } else A.state[r.cell] = img === null ? 3 : 0;   // null = 없는 파일 · 1×1 = 그사이 다른 쪽이 놓음 → 다시
    this.drop(key);   // 원본은 곧바로 놓는다
    this.game.dirty = true;
  }

  // ───────────────────────── 크게 보기 (§5.3) ─────────────────────────
  openViewer(k) {
    const row = this.rows.cg[k];
    if (!row) return;
    if (!row.open) { audio.sfx('menu_cancel'); return; }
    audio.sfx('menu_ok');
    this.sel[0] = k;
    for (const j of this.ready.splice(0)) { if (this.atlas) this.atlas.state[j.r.cell] = 0; this.drop(j.key); }   // 굽기를 멈춘다
    this.viewer = { vi: Math.max(0, this.openCg.indexOf(row)), t: 0, ui: OVERLAY_SEC, dir: 1, tapT: -9, tapX: 0, tapY: 0, uiPrev: 0, wheel: 0, keys: new Set(), shown: null, z: {} };
    this.deferToasts = true;   // 업적 알림이 그림을 가리지 않게 (크게 보기가 열린 동안만)
    this.viewerLoad();
  }
  /** 지금 그림 + 가는 쪽 다음 그림만 붙잡고 나머지는 놓는다 (디코딩 CG ≤ 2장) */
  viewerLoad() {
    const V = this.viewer, L = this.openCg;
    const cur = L[V.vi], nxt = L[V.vi + V.dir] ?? L[V.vi - V.dir];
    const keep = new Set([cur?.key, nxt?.key].filter(Boolean));
    for (const k of [...V.keys]) if (!keep.has(k)) { V.keys.delete(k); this.drop(k); }
    for (const k of keep) { V.keys.add(k); this.want(k); }
  }
  stepViewer(d) {
    const V = this.viewer, j = V.vi + d;
    V.ui = OVERLAY_SEC;
    if (j < 0 || j >= this.openCg.length) { audio.sfx('menu_cancel'); return; }
    V.vi = j; V.dir = d; V.t = 0; V.shown = null;
    this.sel[0] = Math.max(0, this.rows.cg.indexOf(this.openCg[j]));   // 목록 선택도 따라간다
    audio.sfx('menu_move');
    this.viewerLoad();
  }
  closeViewer() {
    const V = this.viewer;
    if (!V) return;
    this.viewer = null; this.deferToasts = false;
    for (const k of V.keys) this.drop(k);
    this.scs[0].follow(this.sel[0]);
    audio.sfx('menu_cancel');
  }
  toggleFit() { FIT_COVER = !FIT_COVER; audio.sfx('menu_move'); if (this.viewer) this.viewer.ui = OVERLAY_SEC; }
  updateViewer(dt, nav, ges) {
    const V = this.viewer;
    V.t += dt;
    if (V.ui > 0) V.ui = Math.max(0, V.ui - dt);
    const z = V.z;
    if (ges.tap(z.close)) { this.closeViewer(); return; }
    if (ges.tap(z.prev)) { this.stepViewer(-1); return; }
    if (ges.tap(z.next)) { this.stepViewer(1); return; }
    if (ges.swipe) { this.stepViewer(ges.swipe.dir); return; }
    if (ges.tapOK) {
      // 탭 = 덮개 보이기·숨기기, 두 번 탭(0.32초 · 40 px 안) = 맞춤 ↔ 가득 채움 (첫 탭의 덮개 토글은 되돌린다)
      const p = input.pointer;
      if (V.t - V.tapT < 0.32 && Math.hypot(p.x - V.tapX, p.y - V.tapY) < 40) { V.tapT = -9; this.toggleFit(); V.ui = V.uiPrev > 0 ? OVERLAY_SEC : 0; }
      else { V.tapT = V.t; V.tapX = p.x; V.tapY = p.y; V.uiPrev = V.ui; V.ui = V.ui > 0 ? 0 : OVERLAY_SEC; }
      return;
    }
    if (ges.wheel) {
      V.wheel += ges.wheel;
      if (Math.abs(V.wheel) >= 60) { const d = Math.sign(V.wheel); V.wheel = 0; this.stepViewer(d); return; }
    } else V.wheel *= 0.9;
    if (nav.cancel || nav.menu) { this.closeViewer(); return; }
    if (nav.left) { this.stepViewer(-1); return; }
    if (nav.right) { this.stepViewer(1); return; }
    if (nav.confirm) { V.ui = V.ui > 0 ? 0 : OVERLAY_SEC; return; }
    if (nav.alt) { this.toggleFit(); return; }
    if (nav.up || nav.down || nav.prevTab || nav.nextTab || nav.alt2 || ges.hover || ges.justDown) V.ui = OVERLAY_SEC;   // 아무 입력이면 다시
  }

  // ───────────────────────── 음악실 (§5.4) ─────────────────────────
  playTrack(id) {
    const row = this.rows.mus.find((r) => r.id === id);
    if (!row?.open) { audio.sfx('menu_cancel'); return; }
    this.pend = null;
    if (audio.current === id) audio.stopMusic(0.2);   // 같은 곡이면 처음부터
    audio.music(id, { fade: 0.4 });
    this.play.id = audio.current; this.play.at = null;
  }
  stopTrack() { this.pend = null; audio.stopMusic(0.6); }
  /** 이웃 열린 곡을 고르고 0.35초 뒤 재생 (다시 누르면 시계를 새로) */
  neighbor(d) {
    const rows = this.rows.mus;
    let i = this.sel[1] + d;
    while (i >= 0 && i < rows.length && !rows[i].open) i += d;
    if (i < 0 || i >= rows.length) { audio.sfx('menu_cancel'); return; }
    this.sel[1] = i; this.scs[1].follow(i);
    this.pend = { id: rows[i].id, t: NEXT_DELAY };
    audio.sfx('menu_move');
  }
  toggleTrack() {
    if (audio.current) { this.stopTrack(); audio.sfx('menu_move'); return; }
    const row = this.rows.mus[this.sel[1]];
    if (row?.open) this.playTrack(row.id); else audio.sfx('menu_cancel');
  }
  /** 지금 재생 칸에 보일 곡: 도는 곡(열린 것), 없으면 고른 곡 */
  panelRow() {
    const cur = audio.current, rows = this.rows.mus;
    const r = cur ? rows.find((x) => x.id === cur && x.open) : null;
    return r ?? rows[this.sel[1]] ?? null;
  }
  tickMusic(dt) {
    if (this.pend) { this.pend.t -= dt; if (this.pend.t <= 0) { const id = this.pend.id; this.pend = null; this.playTrack(id); } }
    const cur = audio.current;
    this.recT -= dt;
    if (this.recT <= 0) { this.recT = 0.25; this.rec = safe(() => audio.recStats?.(), null); }
    if (cur !== this.play.id) { this.play.id = cur; this.play.at = null; }
    const ctx = audio.ctx, pl = this.rec?.player;
    if (cur && this.play.at == null && ctx && pl?.id === cur) this.play.at = ctx.currentTime;
    const inMusic = this.ri === 1 && !this.viewer;
    this.keepAwake = inMusic && !!cur;   // 음악실에서 곡이 도는 동안만 (§5.1)
    // 시각화: 음악실에 있을 때만 analyser 를 붙인다 (컨텍스트가 나중에 생기면 0.5초마다 다시 묻는다)
    if (inMusic) {
      if (!this.an) { this.anT -= dt; if (this.anT <= 0) { this.anT = 0.5; this.an = safe(() => audio.analyser?.(true) ?? null, null); } }
    } else if (this.an) { safe(() => audio.analyser?.(false)); this.an = null; this.anT = 0; }
    if (inMusic) this.tickBars(dt);
  }
  tickBars(dt) {
    const B = this.bars, cur = audio.current, running = !!cur && audio.ctx?.state === 'running';
    const rm = this.game.settings?.reduceMotion ? 0.5 : 1;
    const k = 1 - Math.exp(-dt * 14);
    let data = null;
    if (this.an && running) { try { this.an.getByteFrequencyData(this.fft); data = this.fft; } catch { data = null; } }
    let h = 0, beat = 0, ph = 0;
    if (!data && running) {
      const row = this.rows.mus.find((r) => r.id === cur);
      h = row?.hash ?? 7; beat = row?.bpm ?? 100;
      const el = this.play.at != null ? audio.ctx.currentTime - this.play.at : this.t;
      ph = (el * beat / 60) % 1;
    }
    for (let i = 0; i < BARS; i++) {
      let v;
      if (data) v = data[i] / 255;
      else if (running) {
        const pulse = Math.pow(1 - ph, 2.4), base = hash01(h, i), wob = hash01(h, i + 97 + Math.floor((this.t * beat) / 60) * 31);
        v = 0.12 + 0.42 * base * (0.45 + 0.55 * pulse) + 0.22 * wob * pulse + (i < 6 ? 0.18 * pulse : 0);
      } else v = 0.04;
      v = 0.3 + (clamp(v, 0, 1) - 0.3) * rm;   // 동작 줄이기: 높이 변화 절반
      B[i] += (v - B[i]) * k;
    }
  }

  // ───────────────────────── 극장 (§5.5) ─────────────────────────
  playTheater(k) {
    const row = this.rows.th[k];
    if (!row) return;
    if (this.pushed) { audio.sfx('menu_cancel'); this.note(TH_OFF_LINE, PAL.warn); return; }
    if (!row.open) { audio.sfx('menu_cancel'); if (row.ending) this.note(TH_LOCK_END, PAL.warn); return; }
    audio.sfx('menu_ok');
    const g = this.game, d = row.def, P = own(TH_DEF, row.id) ? TH_DEF[row.id] : {};
    const backParams = { back: this.back ?? 'title', backIndex: this.backIndex, room: 'theater' };
    if (row.credits) { g.go('credits', { kind: null, back: 'gallery', backParams }); return; }
    if (row.ending) {
      const E = ENDINGS[row.ending], ti = d.title && typeof d.title === 'object' ? d.title : null;
      g.go('story', {
        script: typeof d.script === 'string' ? d.script : `ending_${row.ending}`, replay: true,
        bg: d.bg ?? E.bg, music: d.music ?? E.music, title: { eng: ti?.eng ?? E.eng, kor: ti?.kor ?? `「${E.name}」` },
        then: 'credits', thenParams: { kind: typeof d.credits === 'string' ? d.credits : row.ending, back: 'gallery', backParams },
      });
      return;
    }
    g.go('story', { script: typeof d.script === 'string' ? d.script : row.id, replay: true, bg: d.bg ?? P.bg ?? null, music: d.music ?? P.music ?? null, then: 'gallery', thenParams: backParams });
  }

  // ───────────────────────── 입력 ─────────────────────────
  update(dt) {
    const g = this.game, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    if (!this.viewer) this.amb.update(dt, W, H);
    const nav = this.nav.poll(dt), ges = this.ges;
    ges.update();
    if (this.msg) { this.msg.t -= dt; if (this.msg.t <= 0) this.msg = null; }
    // 열림이 바뀌었으면(엔진 rev — 저장·동기화·각성) 또는 엔진이 늦게 왔으면 다시 읽는다
    this.pollT -= dt;
    if (this.pollT <= 0) { this.pollT = 0.5; const G = this.api(); if ((this.noEngine && G) || (G && safe(() => G.rev, null) !== this.rev)) this.refresh(); }
    this.tickMusic(dt);
    this.bakeTick();
    // 다시 보기·크레딧에서 돌아오는 암전이 걷히는 동안은 입력을 받지 않는다 — 대사를 연타로 넘기던 손이 같은 극장 줄을 다시 틀지 않게 (GAL-VERIFY)
    if (g.fade?.dir < 0) return;
    if (this.viewer) { this.updateViewer(dt, nav, ges); return; }
    const L = this._L, room = this.room;
    const area = L ? this.scrollRect(L) : null;
    if (area) this.scs[this.ri].update(dt, area, ges);
    if (taps.hit(this) === 'back') { this.leave(); return; }
    for (let k = 0; k < this.zChips.length; k++) if (ges.tap(this.zChips[k])) { this.setRoom(k); return; }
    if (room === 'music') {
      const B = this.zBtns;
      if (ges.tap(B.prev)) { this.neighbor(-1); return; }
      if (ges.tap(B.toggle)) { this.toggleTrack(); return; }
      if (ges.tap(B.next)) { this.neighbor(1); return; }
    }
    if (!this.scs[this.ri].dragging) {
      for (const z of this.zItems) {
        if (z.r.thid) continue;
        if (ges.hoverIn(z.r) && this.sel[this.ri] !== z.k) this.sel[this.ri] = z.k;
        if (ges.tap(z.r)) { this.sel[this.ri] = z.k; this.activate(z.k); return; }
      }
    }
    if (area && ges.swipe && inRect(ges.swipe.x, ges.swipe.y, area)) { this.setRoom(this.ri + ges.swipe.dir); return; }
    if (nav.prevTab || nav.nextTab) { this.setRoom(this.ri + (nav.prevTab ? -1 : 1)); return; }
    if (nav.cancel || nav.menu) { this.leave(); return; }
    if (room === 'cg') this.navCg(nav);
    else if (room === 'music') this.navMusic(nav);
    else this.navTh(nav);
  }
  activate(k) {
    const room = this.room;
    if (room === 'cg') this.openViewer(k);
    else if (room === 'music') { const r = this.rows.mus[k]; if (r?.open) { audio.sfx('menu_ok'); this.playTrack(r.id); } else audio.sfx('menu_cancel'); }
    else this.playTheater(k);
  }
  navCg(nav) {
    const n = this.rows.cg.length;
    if (!n) return;
    let i = this.sel[0];
    if (nav.confirm) { this.openViewer(i); return; }
    if (nav.left && i > 0) i--;
    else if (nav.right && i < n - 1) i++;
    else if (nav.up || nav.down) {
      // 칸 머리로 줄이 끊기므로 '보이는 줄' 단위로: 위·아래 줄의 같은 열(없으면 마지막 칸)
      const vr = this.geo?.cg?.vrows ?? [];
      const r = vr.findIndex((row) => row.includes(i));
      const to = vr[r + (nav.up ? -1 : 1)];
      if (r >= 0 && to) i = to[Math.min(vr[r].indexOf(i), to.length - 1)];
    }
    if (i !== this.sel[0]) { this.sel[0] = i; audio.sfx('menu_move'); }
  }
  navMusic(nav) {
    const n = this.rows.mus.length;
    if (!n) return;
    if (nav.left || nav.right) { this.neighbor(nav.left ? -1 : 1); return; }
    if (nav.alt) { this.stopTrack(); audio.sfx('menu_move'); return; }
    if (nav.confirm) { this.activate(this.sel[1]); return; }
    const i = this.sel[1];
    if (nav.up && i > 0) { this.sel[1]--; audio.sfx('menu_move'); }
    else if (nav.down && i < n - 1) { this.sel[1]++; audio.sfx('menu_move'); }
  }
  navTh(nav) {
    const n = this.rows.th.length, i = this.sel[2];
    if (!n) return;
    if (nav.confirm) { this.playTheater(i); return; }
    if (nav.up && i > 0) { this.sel[2]--; audio.sfx('menu_move'); }
    else if (nav.down && i < n - 1) { this.sel[2]++; audio.sfx('menu_move'); }
  }

  // ───────────────────────── 배치 (§5.2) ─────────────────────────
  layout() {
    const g = this.game, k = g.uiK || 1, W = g.uiW || g.viewW, H = g.uiH || g.viewH;
    const per = Math.max(0.2, (g.cssScale || 1) * k);
    const S = hudSafe(g);
    const sl = (S.l || 0) / k, sr = (S.r || 0) / k, st = (S.t || 0) / k, sb = (S.b || 0) / k;
    const wide = W >= 960 && H >= 500;
    const minRow = 36 / per, minBtn = 44 / per;   // 잘린 카드·줄을 등록할 최소 크기 (UI px)
    if (wide) {
      const chipsY = st + 70, top = chipsY + 44 + 12, bot = H - sb - 34 - 6;
      const cw = 176, cx = Math.round(W / 2 - (cw * 3 + 24) / 2);
      return {
        W, H, sl, sr, st, sb, per, wide, minRow, minBtn,
        back: { x: 14 + sl, y: 12 + st, w: 92, h: 44 },
        chips: { x: cx, y: chipsY, w: cw, h: 44, gap: 12 },
        area: { x: sl + 16, y: top, w: W - sl - sr - 32, h: bot - top },
      };
    }
    const chipsY = st + 58, top = chipsY + 44 + 9, bot = H - sb - 34 - 2;
    return {
      W, H, sl, sr, st, sb, per, wide, minRow, minBtn,
      back: { x: 12 + sl, y: 4 + st, w: 92, h: 44 },
      chips: { x: sl + 12, y: chipsY, w: 150, h: 44, gap: 10 },
      area: { x: sl + 12, y: top, w: W - sl - sr - 24, h: bot - top },
    };
  }
  /** 방별 내용 배치 (배치·목록이 바뀔 때만 다시 계산) */
  geoOf(L, kind) {
    const key = `${L.W}|${L.H}|${L.sl}|${L.sr}|${L.st}|${L.sb}|${L.per}|${this.err ? 1 : 0}|${this.pushed ? 1 : 0}`;
    if (key !== this.geoKey) { this.geoKey = key; this.geo = {}; }
    return (this.geo[kind] ??= kind === 'cg' ? this.geoCg(L) : kind === 'mus' ? this.geoMus(L) : this.geoTh(L));
  }
  geoCg(L) {
    const A = L.area, gap = L.wide ? 12 : 10;
    const cols = L.wide ? Math.max(2, Math.floor((L.W - 32) / 208)) : 4;   // desk 6 · tablet 4 · 휴대폰 4
    const cw = Math.floor((A.w - 10 - (cols - 1) * gap) / cols), th = Math.round(cw / ASPECT), ch = th + 24, head = L.wide ? 30 : 28;
    const items = [], vrows = [], heads = [];
    let y = (this.err ? 26 : 0) + (this.sum.cg.got ? 0 : 30);
    for (const part of PARTS) {
      const idx = [];
      this.rows.cg.forEach((r, i) => { if (r.part === part) idx.push(i); });
      if (!idx.length) continue;
      heads.push({ part, name: partName(part), y, got: idx.filter((i) => this.rows.cg[i].open).length, n: idx.length });
      y += head;
      for (let k = 0; k < idx.length; k += cols) {
        const row = idx.slice(k, k + cols);
        row.forEach((i, c) => { items[i] = { x: c * (cw + gap), y, w: cw, h: ch }; });
        vrows.push(row);
        y += ch + gap;
      }
      y += 6;
    }
    return { cols, cw, th, ch, gap, head, items, vrows, heads, total: y };
  }
  geoMus(L) {
    const A = L.area;
    let list, panel = null, band = null;
    const rowH = L.wide ? 40 : Math.max(44, Math.ceil(38 / L.per)), head = 26;
    if (L.wide) {
      const lw = Math.round(A.w * 0.6) - 8;
      list = { x: A.x, y: A.y, w: lw, h: A.h };
      panel = { x: A.x + lw + 16, y: A.y, w: A.w - lw - 16, h: A.h };
    } else {
      list = { x: A.x, y: A.y, w: A.w, h: A.h - 60 - 9 };
      band = { x: A.x, y: A.y + A.h - 60, w: A.w, h: 60 };
    }
    const items = [], heads = [];
    let y = this.err ? 26 : 0, sec = null;
    this.rows.mus.forEach((r, i) => {
      if (r.sec !== sec) {
        sec = r.sec;
        const same = this.rows.mus.filter((x) => x.sec === sec);
        heads.push({ sec, y, got: same.filter((x) => x.open).length, n: same.length });
        y += head;
      }
      items[i] = { x: 0, y, w: list.w - 10, h: rowH };
      y += rowH;
    });
    return { list, panel, band, rowH, head, items, heads, total: y };
  }
  geoTh(L) {
    const A = L.area, n = Math.max(1, this.rows.th.length), top = this.err ? 26 : 0;
    // 성당(push): 줄 아래 안내 한 줄 자리(30)를 스크롤 밖에 남긴다 — 늘 보이게
    const list = this.pushed ? { x: A.x, y: A.y, w: A.w, h: A.h - 30 } : A;
    const rowH = L.wide ? clamp(Math.floor((list.h - top) / n), Math.max(44, Math.ceil(36 / L.per)), 48) : 56;
    const items = this.rows.th.map((r, i) => ({ x: 0, y: top + i * rowH, w: A.w - 10, h: rowH }));
    return { list, rowH, items, top, total: top + this.rows.th.length * rowH };
  }
  /** 지금 방의 스크롤 영역 */
  scrollRect(L) { return this.room === 'music' ? this.geoOf(L, 'mus').list : this.room === 'theater' ? this.geoOf(L, 'th').list : L.area; }

  // ───────────────────────── 그리기 ─────────────────────────
  render(ctx) {
    const g = this.game, t = g.time;
    const L = this._L = this.layout();
    this.devK = ctxScale(ctx);
    this.toastY = L.wide ? L.st + 142 : L.st + 122;   // 토스트는 방 칩 아래 (칩을 가리지 않게)
    this.zChips.length = 0; this.zItems.length = 0; this.zBtns = {};
    if (this.viewer) { this.renderViewer(ctx, L, t); this.ges.flush(); return; }
    this.drawBg(ctx, L, t);
    this.renderHead(ctx, L);
    const ck = ease.outCubic(clamp((this.t - this.roomT) / 0.3, 0, 1));
    ctx.save();
    if (ck < 1) { ctx.globalAlpha = 0.3 + 0.7 * ck; ctx.translate((1 - ck) * 20, 0); }
    if (this.room === 'cg') this.renderCg(ctx, L, t);
    else if (this.room === 'music') this.renderMusic(ctx, L, t);
    else this.renderTheater(ctx, L, t);
    ctx.restore();
    this.renderChips(ctx, L, t);
    this.renderFooter(ctx, L);
    this.drawMsg(ctx, L);
    backButton(ctx, L.back.x, L.back.y, '뒤로', this);
    this.ges.flush();
  }
  drawBg(ctx, L, t) {
    const W = L.W, H = L.H, img = assets.get('bg/title');
    const lean = leanMem(this.game);
    const bgScale = lean ? Math.min(ctxScale(ctx) * 0.5, Math.sqrt(2e5 / Math.max(1, W * H))) : null;
    this.bgLayer.draw(ctx, `galbg|${img ? 1 : 0}`, 0, 0, W, H, bgScale, (c) => {
      kenBurns(c, img, W, H, 0, { z0: 1.06, z1: 1.06, oy: 0.4 });
      c.fillStyle = 'rgba(8,3,10,0.66)'; c.fillRect(0, 0, W, H);
      shade(c, W, H, { top: 0.6, bottom: 0.72, vig: 0.8 });
    }, lean ? 'low' : 'medium');
    if (this.moon) drawDecoMoon(ctx, W * 0.82, L.st + H * 0.16, H * 0.06, t);
    this.amb.draw(ctx, W, H, 'back', t);
    this.amb.draw(ctx, W, H, 'front', t);
  }
  renderHead(ctx, L) {
    const W = L.W;
    if (L.wide) {
      bigHeading(ctx, W / 2, L.st + 27, 'GALLERY', '회랑', { size: 22, alpha: ease.outCubic(clamp(this.t / 0.4, 0, 1)) });
      text(ctx, this.sum.txt, W - L.sr - 18, L.st + 34, { size: 14, align: 'right', weight: 800, color: BONE, ow: 2 });
      return;
    }
    text(ctx, '회랑', L.back.x + L.back.w + 14, L.st + 34, { size: 22, weight: 900, family: FONT.title, color: GOLD, ow: 3 });
    text(ctx, this.sum.txt, W - L.sr - 16, L.st + 32, { size: 13, align: 'right', weight: 800, color: BONE, ow: 2 });
  }
  /** 방 칩 셋: '그림 a/b' · '음악 c/d' · '극장 e/f' (+ NEW 점) */
  renderChips(ctx, L, t) {
    const R = L.chips;
    ROOMS.forEach((room, k) => {
      const r = { x: R.x + k * (R.w + R.gap), y: R.y, w: R.w, h: R.h };
      this.zChips[k] = this.ges.zone(r, 'primary', { src: 'gal.chip' });
      const sel = k === this.ri, s = this.sum[room.kind];
      ctx.fillStyle = sel ? 'rgba(150,20,42,0.92)' : 'rgba(18,8,18,0.86)'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = sel ? GOLD : this.ges.over(r) ? 'rgba(232,200,114,0.7)' : 'rgba(200,160,90,0.35)'; ctx.lineWidth = sel ? 2 : 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      glyph(ctx, k === 0 ? 'eye' : k === 1 ? 'rune' : 'play', r.x + 22, r.y + r.h / 2, 16, sel ? PAL.goldHi : GOLD, 1.6);
      text(ctx, room.name, r.x + 40, r.y + r.h / 2 + 5, { size: 15, weight: 800, color: sel ? '#fff4dc' : '#c8b8a8', ow: 2 });
      text(ctx, `${s.got}/${s.total}`, r.x + r.w - 12, r.y + r.h / 2 + 5, { size: 13, align: 'right', weight: 800, family: FONT.num, color: sel ? '#ffe8c0' : '#a89a8a', ow: 2 });
      if (this.roomNew[k]) { ctx.fillStyle = NEW_C; ctx.beginPath(); ctx.arc(r.x + r.w - 6, r.y + 7, 3.4, 0, TAU); ctx.fill(); }
    });
  }
  renderFooter(ctx, L) {
    const room = this.room;
    if (room === 'cg') footer(ctx, L.W, L.H, [[['prevTab', 'nextTab'], '방'], ['dpad', '고르기'], ['confirm', '보기'], ['cancel', '돌아가기']], '그림을 누르면 크게 볼 수 있어요');
    else if (room === 'music') footer(ctx, L.W, L.H, [[['prevTab', 'nextTab'], '방'], ['dpadV', '고르기'], ['confirm', '재생'], ['alt', '정지'], ['dpadH', '이전·다음 곡'], ['cancel', '돌아가기']], '곡을 누르면 재생합니다');
    else footer(ctx, L.W, L.H, [[['prevTab', 'nextTab'], '방'], ['dpadV', '고르기'], ['confirm', '보기'], ['cancel', '돌아가기']], '');
  }
  /** 내용 위 한 줄 (엔진 없음) */
  errLine(ctx, A, y) { text(ctx, ERR_LINE, A.x + A.w / 2, y + 18, { size: 13, align: 'center', weight: 800, color: '#ffb0a0', ow: 2 }); }
  drawMsg(ctx, L) {
    const m = this.msg;
    if (!m) return;
    const a = clamp(m.t / 0.3, 0, 1), w = Math.min(L.W - 40, 520), x = L.W / 2 - w / 2, y = L.H - L.sb - 34 - 46;
    ctx.save(); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,4,12,0.92)'; ctx.fillRect(x, y, w, 34);
    ctx.strokeStyle = 'rgba(232,200,114,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 33);
    text(ctx, fit(ctx, m.text, w - 20, 14, 700), L.W / 2, y + 22, { size: 14, align: 'center', weight: 700, color: m.color, ow: 2 });
    ctx.restore();
  }

  // ── 그림 방 ──
  renderCg(ctx, L, t) {
    const A = L.area, G = this.geoOf(L, 'cg'), rows = this.rows.cg, sc = this.scs[0], i = this.sel[0];
    sc.setMax(G.total - A.h);
    const it = G.items[i];
    if (it && sc.shouldFollow(i)) sc.ensure(it.y - (G.heads.some((h) => h.y + G.head === it.y) ? G.head : 0), it.y + it.h, A.h, 8);
    clipBegin(ctx, A);
    const y0 = A.y - sc.y;
    if (this.err) this.errLine(ctx, A, y0);
    if (!this.sum.cg.got) text(ctx, fit(ctx, EMPTY_LINE, A.w - 20, 14, 700), A.x + A.w / 2, y0 + (this.err ? 26 : 0) + 20, { size: 14, align: 'center', weight: 700, color: DIM, ow: 2 });
    for (const h of G.heads) {
      const y = y0 + h.y;
      if (y > A.y + A.h || y + G.head < A.y) continue;
      text(ctx, h.name, A.x + 2, y + G.head - 10, { size: L.wide ? 16 : 15, weight: 800, family: FONT.title, color: GOLD, ow: 2 });
      text(ctx, `${h.got} / ${h.n}`, A.x + A.w - 16, y + G.head - 10, { size: 13, align: 'right', weight: 800, family: FONT.num, color: h.got >= h.n ? GOLD : '#c8b8a8', ow: 2 });
      divider(ctx, A.x, y + G.head - 3, A.w - 12, { center: false, a: 0.45 });
    }
    this.visCg.length = 0;
    for (let k = 0; k < rows.length; k++) {
      const p = G.items[k];
      if (!p) continue;
      const r = { x: A.x + p.x, y: y0 + p.y, w: p.w, h: p.h };
      if (r.y > A.y + A.h || r.y + r.h < A.y) continue;
      this.zItems.push({ k, r: clipZone(r, A, 'list', this.ges, 'gal.card', L.minRow) });
      this.visCg.push(k);
      this.drawCard(ctx, rows[k], r, G.th, k === i, t);
    }
    clipEnd(ctx, A, sc, 'rgba(8,4,12,0.9)');
    scrollbar(ctx, A.x + A.w - 5, A.y, A.h, sc, A.h);
  }
  drawCard(ctx, row, r, th, sel, t) {
    const { x, y, w } = r;
    ctx.fillStyle = 'rgba(10,4,12,0.8)'; ctx.fillRect(x, y, w, r.h);
    if (!row.open) this.lockCard(ctx, row, x, y, w, th);
    else if (!this.drawThumb(ctx, row, x, y, w, th)) this.nameCard(ctx, row, x, y, w, th);
    // 아래 줄: 열린 그림은 이름, 잠긴 그림은 자리 힌트 (§5.2)
    const label = row.open ? row.name : row.at || '???';
    text(ctx, fit(ctx, label, w - 12, 13, 800), x + w / 2, y + th + 17, { size: 13, align: 'center', weight: 800, color: !row.open ? '#8a7a74' : sel ? '#fff4dc' : BONE, ow: 2 });
    ctx.strokeStyle = sel ? GOLD : this.ges.over(r) ? 'rgba(232,200,114,0.6)' : 'rgba(232,200,114,0.16)'; ctx.lineWidth = sel ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, r.h - 1);
    if (row.isNew) diamond(ctx, x + w - 12, y + 12, 6.5, NEW_C, 'rgba(0,0,0,0.85)');
    if (sel) brackets(ctx, x, y, w, r.h, t);
  }
  drawThumb(ctx, row, x, y, w, h) {
    const A = this.atlas;
    if (!A || row.cell < 0 || A.state[row.cell] !== 2) return false;
    ctx.drawImage(A.cv, (row.cell % CELLS) * A.cw, Math.floor(row.cell / CELLS) * A.ch, A.cw, A.ch, x, y, w, h);
    return true;
  }
  /** 이름 카드 (데이터 절약 · 굽기 전 · 받지 못함): 벡터 틀 + 이름 */
  nameCard(ctx, row, x, y, w, h) {
    fillGradRect(ctx, vGrad(ctx, h, NAME_G), x, y, w, h);
    ctx.strokeStyle = 'rgba(232,200,114,0.22)'; ctx.lineWidth = 1; ctx.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
    text(ctx, fit(ctx, row.name, w - 28, 15, 800, FONT.title), x + w / 2, y + h / 2 + 2, { size: 15, align: 'center', weight: 800, family: FONT.title, color: '#f0dcb8', ow: 2 });
    text(ctx, fit(ctx, row.part === 'aw' ? PART_SHORT.aw : `${PART_SHORT[row.part]} · ${row.at}`, w - 28, 11, 700), x + w / 2, y + h / 2 + 22, { size: 11, align: 'center', weight: 700, color: '#a89080', ow: 0 });
  }
  /** 잠긴 카드: 벡터 틀 + 자물쇠 + ??? — 그림 파일을 받지 않는다 */
  lockCard(ctx, row, x, y, w, h) {
    fillGradRect(ctx, vGrad(ctx, h, LOCK_G), x, y, w, h);
    glyph(ctx, 'lock', x + w / 2, y + h / 2 - 8, 20, '#6a5a60', 1.6);
    text(ctx, '???', x + w / 2, y + h / 2 + 22, { size: 14, align: 'center', weight: 900, family: FONT.num, color: '#7a6a70', ow: 0 });
  }

  // ── 음악실 ──
  renderMusic(ctx, L, t) {
    const G = this.geoOf(L, 'mus'), LR = G.list, rows = this.rows.mus, sc = this.scs[1], i = this.sel[1];
    ctx.fillStyle = 'rgba(6,2,8,0.42)'; ctx.fillRect(LR.x - 4, LR.y - 4, LR.w + 8, LR.h + 8);
    sc.setMax(G.total - LR.h);
    const it = G.items[i];
    if (it && sc.shouldFollow(i)) sc.ensure(it.y - G.head, it.y + it.h, LR.h, 4);
    clipBegin(ctx, LR);
    const y0 = LR.y - sc.y;
    if (this.err) this.errLine(ctx, LR, y0);
    for (const h of G.heads) {
      const y = y0 + h.y;
      if (y > LR.y + LR.h || y + G.head < LR.y) continue;
      text(ctx, h.sec, LR.x + 6, y + 18, { size: 14, weight: 800, family: FONT.title, color: GOLD, ow: 2 });
      text(ctx, `${h.got} / ${h.n}`, LR.x + LR.w - 18, y + 18, { size: 12, align: 'right', weight: 800, family: FONT.num, color: '#a89a8a', ow: 0 });
    }
    const cur = audio.current;
    for (let k = 0; k < rows.length; k++) {
      const p = G.items[k];
      const r = { x: LR.x + p.x, y: y0 + p.y, w: p.w, h: p.h };
      if (r.y > LR.y + LR.h || r.y + r.h < LR.y) continue;
      this.zItems.push({ k, r: clipZone(r, LR, 'list', this.ges, 'gal.track', L.minRow) });
      this.drawTrack(ctx, rows[k], r, k === i, cur === rows[k].id, t);
    }
    clipEnd(ctx, LR, sc, 'rgba(8,4,12,0.9)');
    scrollbar(ctx, LR.x + LR.w - 5, LR.y, LR.h, sc, LR.h);
    if (L.wide) this.renderPanel(ctx, L, G.panel, t); else this.renderBand(ctx, L, G.band, t);
  }
  drawTrack(ctx, row, r, sel, playing, t) {
    const h = r.h - 2, cy = r.y + h / 2;
    if (sel) selBar(ctx, r.x, r.y, r.w, h, t);
    else if (this.ges.over(r)) { ctx.fillStyle = 'rgba(255,220,160,0.06)'; ctx.fillRect(r.x, r.y, r.w, h); }
    text(ctx, row.no, r.x + 14, cy + 4, { size: 12, weight: 800, family: FONT.num, color: row.open ? '#c8b080' : '#5e5048', ow: 0 });
    const xr = r.x + r.w - 12;
    let rw = 0;
    if (!row.open) {   // 잠긴 곡: ??? + 칸 힌트
      text(ctx, row.sec, xr, cy + 4, { size: 11, align: 'right', weight: 700, color: '#6e6062', ow: 0 });
      rw = 90;
    } else if (playing) { this.eqIcon(ctx, xr - 16, cy, t); rw = 28; }
    if (row.isNew) diamond(ctx, xr - rw - 8, cy, 5, NEW_C, 'rgba(0,0,0,0.85)');
    const tx = r.x + 74;
    text(ctx, row.open ? fit(ctx, row.name, xr - rw - (row.isNew ? 22 : 8) - tx, 15, 800) : '???', tx, cy + 5, { size: 15, weight: 800, color: !row.open ? '#7a6e70' : playing ? '#ffe8c0' : sel ? '#fff4dc' : BONE, ow: 2 });
  }
  /** 재생 중 표시: 뛰는 막대 셋 */
  eqIcon(ctx, x, cy, t) {
    ctx.fillStyle = GOLD;
    for (let k = 0; k < 3; k++) {
      const h = 4 + 9 * (0.5 + 0.5 * Math.sin(t * (7 + k * 2.3) + k * 1.7));
      ctx.fillRect(x + k * 6, cy + 7 - h, 4, h);
    }
  }
  /** 시각화 막대 32개 (그라디언트는 높이별 캐시 한 개, 원점 기준으로 옮겨 칠한다) */
  drawBars(ctx, R, alpha = 1) {
    const B = this.bars, gap = 2, bw = (R.w - gap * (BARS - 1)) / BARS;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(R.x, R.y);
    ctx.fillStyle = vGrad(ctx, Math.round(R.h), BAR_G);
    for (let i = 0; i < BARS; i++) {
      const h = Math.max(2, B[i] * R.h);
      ctx.fillRect(i * (bw + gap), R.h - h, bw, h);
    }
    ctx.restore();
  }
  badge() {
    const cur = audio.current, rec = this.rec;
    if (!cur) return '';
    if (rec?.pend === cur) return '불러오는 중…';
    if (rec?.player?.id === cur) return rec.player.rec ? '녹음 음원' : '합성음';
    return '';
  }
  elapsed() { const c = audio.ctx; return this.play.at != null && c ? c.currentTime - this.play.at : 0; }
  /** 넓은 배치: 오른쪽 '지금 재생' 칸 */
  renderPanel(ctx, L, P, t) {
    frame(ctx, P.x, P.y, P.w, P.h, { top: 'rgba(26,12,28,0.9)', bot: 'rgba(8,3,10,0.92)', edge: PAL.goldDim });
    const pad = 18, x = P.x + pad, w = P.w - pad * 2, row = this.panelRow(), cur = audio.current;
    const playing = !!row && cur === row.id;
    text(ctx, '지금 재생', x, P.y + 28, { size: 13, weight: 800, color: DIM, ow: 2 });
    if (playing) this.eqIcon(ctx, x + w - 14, P.y + 22, t);
    if (row) {
      text(ctx, row.open ? fit(ctx, row.name, w, 22, 800, FONT.title) : '???', x, P.y + 62, { size: 22, weight: 800, family: FONT.title, color: playing ? '#fff4dc' : BONE, ow: 3 });
      text(ctx, fit(ctx, `${row.sec} · ${row.loop ? '반복 재생' : '한 번 재생'}`, w, 13, 700), x, P.y + 86, { size: 13, weight: 700, color: '#c8b8a8', ow: 2 });
    }
    const bg = this.badge();
    if (bg) pill(ctx, bg, x, P.y + 98, { color: bg === '녹음 음원' ? '#ffd8a0' : '#c8d8ff', size: 11, h: 20 });
    if (playing) text(ctx, clock(this.elapsed()), x + w, P.y + 114, { size: 18, align: 'right', weight: 800, family: FONT.num, color: BONE, ow: 2 });
    const by = P.y + P.h - 44 - 14;
    const vy = P.y + 130, vh = Math.min(120, by - 30 - vy);
    if (vh > 20) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, vy, w, vh);
      this.drawBars(ctx, { x: x + 4, y: vy + 4, w: w - 8, h: vh - 8 }, playing ? 1 : 0.5);
    }
    if ((this.game.settings?.musicVol ?? 1) <= 0.001) text(ctx, fit(ctx, VOL0_LINE, w, 12, 700), x, by - 12, { size: 12, weight: 700, color: PAL.warn, ow: 2 });
    this.musicButtons(ctx, { x, y: by, w, h: 44 }, t, 15);
  }
  /** 좁은 배치: 아래 '지금 재생' 띠 (뒤에 높이 24 시각화) */
  renderBand(ctx, L, B, t) {
    fillGradRect(ctx, vGrad(ctx, B.h, BAND_G), B.x, B.y, B.w, B.h);
    ctx.fillStyle = 'rgba(232,200,114,0.35)'; ctx.fillRect(B.x, B.y, B.w, 1);
    const row = this.panelRow(), cur = audio.current, playing = !!row && cur === row.id;
    this.drawBars(ctx, { x: B.x + 2, y: B.y + B.h - 26, w: B.w - 4, h: 24 }, playing ? 0.32 : 0.14);
    const bw = 92, gap = 9, bx = B.x + B.w - (bw * 3 + gap * 2) - 6;
    this.musicButtons(ctx, { x: bx, y: B.y + 8, w: bw * 3 + gap * 2, h: 44 }, t, 13);
    const tw = bx - 16 - (B.x + 12);
    if (row) text(ctx, row.open ? fit(ctx, row.name, tw, 15, 800) : '???', B.x + 12, B.y + 25, { size: 15, weight: 800, color: playing ? '#fff4dc' : BONE, ow: 2 });
    let line;
    if ((this.game.settings?.musicVol ?? 1) <= 0.001) line = VOL0_LINE;
    else if (row) line = [playing ? this.badge() : '', playing ? clock(this.elapsed()) : '', row.loop ? '반복 재생' : '한 번 재생'].filter(Boolean).join(' · ');
    if (line) text(ctx, fit(ctx, line, tw, 12, 700), B.x + 12, B.y + 46, { size: 12, weight: 700, color: line === VOL0_LINE ? PAL.warn : '#c8b8a8', ow: 2 });
  }
  /** [이전 곡] [재생 | 정지] [다음 곡] (이웃과 9 UI px 이상 — 터치 여유로 44 CSS px) */
  musicButtons(ctx, R, t, size) {
    const gap = Math.max(9, Math.round(R.w * 0.03)), bw = (R.w - gap * 2) / 3, ges = this.ges, on = !!audio.current;
    const defs = [['prev', '이전 곡'], ['toggle', on ? '정지' : '재생'], ['next', '다음 곡']];
    defs.forEach(([id, label], k) => {
      const r = { x: R.x + k * (bw + gap), y: R.y, w: bw, h: R.h };
      this.zBtns[id] = ges.zone(r, 'primary', { src: 'gal.music' });
      gbutton(ctx, r, label, { hot: ges.over(r) || (id === 'toggle' && on), size, t, accent: id === 'toggle' ? PAL.crimson : '#7a3a1a' });
    });
  }

  // ── 극장 ──
  renderTheater(ctx, L, t) {
    const G = this.geoOf(L, 'th'), A = G.list, rows = this.rows.th, sc = this.scs[2], i = this.sel[2], off = this.pushed;
    sc.setMax(G.total - A.h);
    const it = G.items[i];
    if (it && sc.shouldFollow(i)) sc.ensure(it.y, it.y + it.h, A.h, 4);
    clipBegin(ctx, A);
    const y0 = A.y - sc.y;
    if (this.err) this.errLine(ctx, A, y0);
    for (let k = 0; k < rows.length; k++) {
      const p = G.items[k], r = { x: A.x + p.x, y: y0 + p.y, w: p.w, h: p.h };
      if (r.y > A.y + A.h || r.y + r.h < A.y) continue;
      if (!off) this.zItems.push({ k, r: clipZone(r, A, 'list', this.ges, 'gal.th', L.minRow) });   // 성당(push): 꺼짐 — 탭 영역 없음
      this.drawTh(ctx, rows[k], r, k === i && !off, off, t, L.wide);
    }
    clipEnd(ctx, A, sc, 'rgba(8,4,12,0.9)');
    scrollbar(ctx, A.x + A.w - 5, A.y, A.h, sc, A.h);
    if (off) text(ctx, TH_OFF_LINE, A.x + A.w / 2, A.y + A.h + 21, { size: 14, align: 'center', weight: 700, color: '#d8b080', ow: 2 });
  }
  drawTh(ctx, row, r, sel, off, t, wide) {
    const h = r.h - 2, cy = r.y + h / 2;
    ctx.save();
    if (off) ctx.globalAlpha *= 0.45;
    if (sel) selBar(ctx, r.x, r.y, r.w, h, t);
    else { ctx.fillStyle = this.ges.over(r) && !off ? 'rgba(255,220,160,0.07)' : 'rgba(255,230,200,0.03)'; ctx.fillRect(r.x, r.y, r.w, h); }
    const open = row.open && !off;
    glyph(ctx, open ? 'play' : 'lock', r.x + 28, cy, open ? 15 : 14, open ? (sel ? PAL.goldHi : GOLD) : '#6a5a60', 1.6);
    const tx = r.x + 54, xr = r.x + r.w - 14;
    const hint = !row.open && row.ending ? TH_LOCK_END : '';
    const hw = hint ? Math.min(r.w * 0.4, 200) : 0;
    text(ctx, row.sub, tx, r.y + (wide ? 17 : 20), { size: 12, weight: 900, family: FONT.num, color: row.open ? '#d8b070' : '#7a6a60', ow: 0 });
    text(ctx, row.open ? fit(ctx, row.name, xr - hw - 10 - tx, 17, 800, FONT.title) : '???', tx, r.y + h - (wide ? 9 : 12), { size: 17, weight: 800, family: FONT.title, color: !row.open ? '#7a6e70' : sel ? '#fff4dc' : BONE, ow: 2 });
    if (hint) text(ctx, fit(ctx, hint, hw, 12, 700), xr, cy + 5, { size: 12, align: 'right', weight: 700, color: '#8a7a74', ow: 0 });
    ctx.restore();
  }

  // ── 크게 보기 ──
  renderViewer(ctx, L, t) {
    const V = this.viewer, W = L.W, H = L.H, row = this.openCg[V.vi];
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const img = row ? assets.get(row.key) : null, iw = img?.naturalWidth || 0, ih = img?.naturalHeight || 0;
    if (img && iw > 4 && ih > 4) {
      if (V.shown !== row.key) { V.shown = row.key; V.at = V.t; }
      const a = clamp((V.t - V.at) / 0.25, 0, 1);
      if (FIT_COVER) kenBurns(ctx, img, W, H, V.t, { z0: 1.0, z1: 1.08, period: 48, panX: 0.02, panY: 0.012, alpha: a });
      else {
        const s = Math.min(W / iw, H / ih), dw = iw * s, dh = ih * s;
        ctx.save(); ctx.globalAlpha = a;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
      }
    } else if (row && assets.failed?.(row.key)) {
      const w = Math.min(520, W - 80), h = 140, x = (W - w) / 2, y = (H - h) / 2;
      frame(ctx, x, y, w, h, { top: 'rgba(26,12,28,0.9)', bot: 'rgba(8,3,10,0.92)', edge: PAL.goldDim });
      text(ctx, LOAD_FAIL, W / 2, y + h / 2 + 6, { size: 16, align: 'center', weight: 800, color: '#ffb0a0', ow: 2 });
    } else {   // 받는 중: 도는 고리
      ctx.save();
      ctx.strokeStyle = 'rgba(232,200,114,0.75)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 18, t * 5, t * 5 + 4.2); ctx.stroke();
      ctx.restore();
    }
    // 덮개 (3초 뒤 숨김, 아무 입력이면 다시)
    const a = clamp(V.ui / 0.3, 0, 1), z = V.z;
    z.close = z.prev = z.next = null;
    if (a <= 0 || !row) return;
    ctx.save();
    ctx.globalAlpha = a;
    fillGradRect(ctx, vGrad(ctx, 90, OV_TOP), 0, 0, W, 90 + L.st);
    const cr = { ...L.back };
    if (a > 0.5) z.close = this.ges.zone(cr, 'primary', { src: 'gal.viewer' });
    gbutton(ctx, cr, '닫기', { hot: this.ges.over(cr), size: 15, t });
    const tx = cr.x + cr.w + 16, xr = W - L.sr - 18, n = this.openCg.length;
    const cnt = `${V.vi + 1} / ${n}`;
    text(ctx, cnt, xr, L.st + 32, { size: 18, align: 'right', weight: 800, family: FONT.num, color: BONE, ow: 3 });
    text(ctx, FIT_COVER ? '가득 채움' : '화면에 맞춤', xr, L.st + 53, { size: 12, align: 'right', weight: 700, color: DIM, ow: 2 });
    const nw = xr - 110 - tx;
    text(ctx, fit(ctx, row.name, nw, 20, 800, FONT.title), tx, L.st + 34, { size: 20, weight: 800, family: FONT.title, color: '#fff4dc', ow: 3 });
    const sub = row.part === 'aw' && row.sub ? row.sub : `${PART_SHORT[row.part]} · ${row.at}`;
    text(ctx, fit(ctx, sub, nw, 13, 700), tx, L.st + 56, { size: 13, weight: 700, color: '#d8c8a8', ow: 2 });
    // 터치: 양옆 화살 단추 (56 × 56)
    if (promptMode() === 'touch') {
      const s = 56, y = H / 2 - s / 2;
      const rp = { x: L.sl + 10, y, w: s, h: s }, rn = { x: W - L.sr - 10 - s, y, w: s, h: s };
      for (const [r, d, id] of [[rp, -1, 'prev'], [rn, 1, 'next']]) {
        const can = V.vi + d >= 0 && V.vi + d < n;
        if (!can) continue;
        if (a > 0.5) z[id] = this.ges.zone(r, 'icon', { src: 'gal.viewer' });
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(r.x + s / 2, r.y + s / 2, s / 2, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(232,200,114,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
        glyph(ctx, d < 0 ? 'chevronL' : 'chevronR', r.x + s / 2, r.y + s / 2, 20, PAL.goldHi, 2.4);
      }
    }
    footer(ctx, W, H, [['dpadH', '넘기기'], ['confirm', '설명'], ['alt', '화면 맞춤'], ['cancel', '닫기']], '옆으로 밀어 넘기고, 한 번 누르면 설명을 숨깁니다');
    ctx.restore();
  }
}
