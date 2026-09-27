// 인게임 오버레이 장면 — owner: OVERLAYS (feel §5.3 · MASTER_PLAN §1.13·§1.16 · platform §4.5·§6.2·§6.3·§8)
//  bossIntro : WARNING(피 글씨, 붉은 경고 띠) → 초상화 + 보스 이름(피 글씨). 1.5초 뒤 결정/탭으로 건너뛰기(안내 글리프). 끝나면 pop → onDone.
//  ultCutin  : 필살기 컷인 0.9초 (각성 컷인보다 한 단계 가벼운 연출). 캐릭터 색 띠와 검은 띠 두 줄이 엇갈려 들어오고,
//              검은 띠 안으로 초상화가 미끄러져 들어와 1.0→1.06 으로 천천히 확대된다 (속도선 유지).
//              기술명은 붓글씨(FONT.brush, 받기 전에는 FONT.title) 50px + 붉은 먹 밑줄이 쓸려 나가고, 그 위에 작게 직업명.
//              2차 전직(tier 2)은 금테. t=0 에 cutin_whoosh. hidePad · deferToasts (MASTER_PLAN §1.13). 설정 reduceMotion 이면 속도선·확대를 줄인다.
//              game.push('ultCutin', { charId, world, classId? }) — classId 가 없으면 world.player.hero.classId.
//              각성 컷인(awakenCutin)이 스택에 있으면 곧바로 닫힌다 (컷인은 한 번에 하나).
//  document  : 비전서/기록 열람. uiScale (platform §6.2), 안내 글리프, 기술 커맨드는 방향 화살표 + 지금 기기의 버튼 글리프.
//  gameover  : GAME OVER(피 글씨) → CONTINUE?(금박 글씨) 카운트다운. uiScale, 버튼 ≥ 44 CSS px (ui.taps), 안내 글리프, 토스트는 미룬다.
//              포기·크레딧 소진 → 마을 {from: 스테이지 id} (마을은 동쪽 성문 앞에서 시작; pause '마을로 귀환' 과 같은 규칙)
// 모든 장면은 스택에 혼자 남아도(?scene=ultCutin&char=lia 같은 디버그 주소) 오류 없이 그리고, 닫히면 타이틀로 간다 (game.pop).
import { Scene } from '../core/game.js';
import { input } from '../core/input.js';
import { audio } from '../core/audio.js';
import { assets } from '../core/assets.js';
import * as UI from '../core/ui.js';
import { text, panel, paragraph, font, wrap, FONT, COLORS, ListMenu, button, bloodText, prewarmText, taps } from '../core/ui.js';
import { drawHints, drawGlyph, promptMode } from '../core/prompts.js';
import { BOSSES } from '../data/bosses.js';
import { CHARACTERS } from '../data/characters.js';
import { CLASSES } from '../data/classes.js';
import { DOCS, LORE } from '../data/lore.js';
import { clamp, ease, rgba, hexToRgb } from '../core/math.js';
import { saves } from '../core/save.js';
import { STAT_INFO } from '../game/stats.js';
import { hudSafe } from '../render/hud_layout.js';

const DEG = Math.PI / 180;
const GOLD = '#e8c872', INK = '#1a0006', INK_SHADOW = '#5a0010', INK_RED = '#b0102a';
const hasDom = () => typeof document !== 'undefined';
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// ───────────────────────── 공용 도우미 ─────────────────────────
/** 이 장면 좌표 1 px 이 몇 CSS px 인가 (uiScale 이면 uiK 포함) */
function cssPer(sc) {
  const g = sc.game;
  return Math.max(0.2, (g.cssScale || 1) * (sc.uiScale ? g.uiK || 1 : 1));
}
/** 주 버튼 높이: 44 CSS px (+2 여유) 이상 → 이 장면 좌표 (platform §6.3) */
function tapH(sc, base = 44) { return Math.max(base, Math.ceil(46 / cssPer(sc))); }
/** 장면 좌표의 안전 영역 여백 (safeArea 'full' 일 때만 0 이 아니다; uiScale 장면은 uiK 로 나눈다) */
function safeOf(sc) {
  const S = hudSafe(sc.game), k = sc.uiScale ? sc.game.uiK || 1 : 1;
  return { l: (S.l || 0) / k, r: (S.r || 0) / k, t: (S.t || 0) / k, b: (S.b || 0) / k };
}
/** 장면 좌표 폭·높이 (uiScale 이면 game.uiW × uiH) */
function viewOf(sc) {
  const g = sc.game;
  return sc.uiScale ? [g.uiW || g.viewW, g.uiH || g.viewH] : [g.viewW, g.viewH];
}
/** 스택에 이 장면 하나뿐인가 (?scene=… 디버그 미리보기: 아래에 그려진 화면이 없다) */
const alone = (sc) => sc.game.scenes[0] === sc;
/** 피 글씨를 enter() 에서 미리 굽는다 (처음 보이는 프레임이 끊기지 않게). k = 장면 배율 (uiScale 장면은 uiK) */
function prewarm(game, k, list) {
  const ctx = game?.ctx;
  if (!ctx?.setTransform) return;
  ctx.save();
  try {
    const s = (game.scale || 1) * (k || 1);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    for (const [str, o] of list) if (str) prewarmText(ctx, str, o);
  } catch { /* 그릴 때 굽는다 */ } finally { ctx.restore(); }
}
/** 터치 모드면 문구 한 줄, 아니면 지금 기기의 버튼 글리프 안내 줄 (platform §4.5) */
function hintLine(ctx, items, touchTip, x, y, { align = 'center', size = 13, color = '#b8a898' } = {}) {
  if (promptMode() === 'touch') {
    if (touchTip) text(ctx, touchTip, x, y, { size, align, color, ow: 2 });
    return;
  }
  drawHints(ctx, items, x, y, { align, size, color });
}

// 초상화 왼쪽 가장자리를 투명하게 (보스 등장 카드의 대각 영역에 사각 경계가 보이지 않도록) — 이미지별 캐시
const _feather = new WeakMap();
function featherLeft(img) {
  let c = _feather.get(img);
  if (c) return c;
  c = mkCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'destination-in';
  const hx = g.createLinearGradient(0, 0, c.width, 0);
  hx.addColorStop(0, 'rgba(0,0,0,0)'); hx.addColorStop(0.3, 'rgba(0,0,0,1)'); hx.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = hx; g.fillRect(0, 0, c.width, c.height);
  _feather.set(img, c);
  return c;
}

// ═══════════════════════════ 보스 등장 ═══════════════════════════
const WARN_OPTS = { size: 64, drips: 0.7 };
const NAME_OPTS = { align: 'left', drips: 0.5 };
const NAME_MAX = 52, NAME_MIN = 26;
/** 이름 카드 세로 위치 (이름 기준선) */
const nameY = (vh) => vh * 0.42 + 56;
/** 이름이 쓸 수 있는 폭: 초상화가 있으면 대각 구분선(위 dx+80 → 아래 dx, dx = 35% vw)까지, 없으면 화면 폭 */
function nameAvail(vw, vh, hasImg) {
  const dx = vw * 0.35;
  return Math.max(160, (hasImg ? dx + 80 * (1 - nameY(vh) / vh) : vw) - 60 - 18);
}

/** 보스 등장: WARNING 경고 → 초상화 + 이름 (피 글씨) */
export class BossIntroScene extends Scene {
  constructor(g) { super(g); this.opaque = false; }
  enter({ bossId, onDone } = {}) {
    this.def = BOSSES[bossId] || { name: bossId ?? '???' };
    this.bossName = String(this.def.name ?? '???');
    this.onDone = onDone; this.dur = 3.6; this.done = false;
    this._nk = null; this._ns = NAME_MAX;
    this.fe = !this.def.portrait;
    // 초상화는 WARNING 동안(1.4초) 받아 둔다: 보스 초상화는 스테이지가 미리 받지 않으므로 이름 카드가 나올 때 비어 있지 않게
    if (this.def.portrait) { try { assets.get(this.def.portrait); } catch (e) { console.error(e); } }
    audio.sfx('warning');
    const g = this.game;
    prewarm(g, 1, [['WARNING', WARN_OPTS], [this.bossName, { ...NAME_OPTS, size: NAME_MAX }]]);
    // 긴 이름은 줄인 크기로 그리므로 그 크기도 미리 굽는다 (초상화가 있는 배치 기준: 이름 카드 첫 프레임이 끊기지 않게)
    if (g?.ctx) {
      try {
        const ns = this.nameSize(g.ctx, nameAvail(g.viewW, g.viewH, !!this.def.portrait));
        if (ns !== NAME_MAX) prewarm(g, 1, [[this.bossName, { ...NAME_OPTS, size: ns }]]);
      } catch { /* 그릴 때 굽는다 */ }
    }
  }
  finish() {
    if (this.done) return;
    this.done = true;
    this.game.pop();
    this.onDone?.();
  }
  update(dt) {
    // 초상화가 도착하면 WARNING 동안 가장자리 페더 사본을 미리 굽는다 (이름 카드가 미끄러져 들어오는 첫 프레임이 끊기지 않게)
    if (!this.fe && this.t > 0.1 && this.t < 1.4) {
      const img = assets.get(this.def.portrait);
      if (img?.width) { this.fe = true; try { featherLeft(img); } catch (e) { console.error(e); } }
    }
    if (this.t > 1.3 && !this.roared) { this.roared = true; audio.sfx('boss_roar'); this.game.world?.camera?.shake(10, 0.6); }
    this.game.world?.camera?.tickShake?.(dt); // 월드가 멈춰 있어도 포효 흔들림을 소리와 함께 재생
    if (this.t > this.dur || (this.t > 1.5 && (input.pressed('confirm') || input.pointer.tapped))) this.finish();
  }
  /** 이름 글자 크기: 대각 구분선 안에 들어가도록 줄인다 (폭이 바뀔 때만 다시 잰다) */
  nameSize(ctx, avail) {
    const key = Math.round(avail);
    if (this._nk !== key) {
      this._nk = key;
      const adv = prewarmText(ctx, this.bossName, { ...NAME_OPTS, size: NAME_MAX });
      this._ns = adv > avail ? Math.max(NAME_MIN, Math.floor(NAME_MAX * avail / adv)) : NAME_MAX;
    }
    return this._ns;
  }
  render(ctx) {
    const vw = this.game.viewW, vh = this.game.viewH, t = this.t;
    if (alone(this)) { ctx.fillStyle = '#07030a'; ctx.fillRect(0, 0, vw, vh); }
    if (t < 1.4) {
      // 화면 전체 붉은 깜빡임(초당 3번)은 번쩍임 설정을 따른다 (feel §4.9 광과민 대책 · R12): 약하게 0.5 = 폭 절반, 끔 0 = 깜빡이지 않음
      const fk = Number(this.game.settings?.flashFx ?? 1), blink = Number.isFinite(fk) ? clamp(fk, 0, 1) : 1;
      const on = Math.floor(t * 6) % 2 === 0;
      ctx.fillStyle = `rgba(120,0,10,${(0.25 + (on ? 0.1 : -0.1) * blink).toFixed(3)})`; ctx.fillRect(0, 0, vw, vh);
      for (const y of [vh * 0.38, vh * 0.62]) {
        ctx.fillStyle = 'rgba(180,0,20,0.85)'; ctx.fillRect(0, y - 14, vw, 28);
        ctx.save(); ctx.beginPath(); ctx.rect(0, y - 14, vw, 28); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        const off = (t * 300) % 60;
        ctx.beginPath();
        for (let x = -60; x < vw + 60; x += 60) { ctx.moveTo(x + off, y - 14); ctx.lineTo(x + off + 30, y - 14); ctx.lineTo(x + off + 10, y + 14); ctx.lineTo(x + off - 20, y + 14); ctx.closePath(); }
        ctx.fill();
        ctx.restore();
      }
      // 피 글씨 WARNING: 깜빡이는 동안에도 핏방울은 처음부터 흘러내린다 (t). 번쩍임을 끄면 깜빡이지 않고 계속 보인다
      if (on || blink === 0) bloodText(ctx, 'WARNING', vw / 2, vh / 2 + 22, { ...WARN_OPTS, t });
      return;
    }
    const k = ease.outCubic(clamp((t - 1.4) / 0.5, 0, 1));
    const out = clamp((this.dur - t) / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = out;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, vw, vh);
    const img = this.def.portrait ? assets.get(this.def.portrait) : null;
    const dx = vw * 0.35; // 대각 구분선: 위 dx+80 → 아래 dx
    if (img) {
      // 대각 영역을 빈틈없이 채운다: 어두운 바탕 + 화면 오른쪽·위에 붙인 초상화(아래쪽은 잘림) + 왼쪽 가장자리 페더
      const h = vh * 1.18, w = h * img.width / img.height;
      const px = vw - w + (1 - k) * 200;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(dx + 80, 0); ctx.lineTo(vw, 0); ctx.lineTo(vw, vh); ctx.lineTo(dx, vh); ctx.clip();
      ctx.fillStyle = '#12040a'; ctx.fillRect(dx, 0, vw - dx, vh);
      const gk = `${vw}|${vh}|${Math.round(w)}`;
      if (this._gk !== gk) { // 그라데이션은 화면·초상화 크기가 바뀔 때만 새로 만든다
        this._gk = gk;
        const rg = ctx.createRadialGradient(vw - w * 0.5, vh * 0.45, 20, vw - w * 0.5, vh * 0.45, vw * 0.5);
        rg.addColorStop(0, 'rgba(150,10,30,0.45)'); rg.addColorStop(1, 'rgba(150,10,30,0)');
        const bg = ctx.createLinearGradient(0, vh * 0.7, 0, vh);
        bg.addColorStop(0, 'rgba(18,4,10,0)'); bg.addColorStop(1, 'rgba(18,4,10,0.85)');
        this._rg = rg; this._bg = bg;
      }
      ctx.fillStyle = this._rg; ctx.fillRect(dx, 0, vw - dx, vh);
      ctx.drawImage(featherLeft(img), px, 0, w, h);
      ctx.fillStyle = this._bg; ctx.fillRect(dx, vh * 0.7, vw - dx, vh * 0.3);
      ctx.restore();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(dx + 80, 0); ctx.lineTo(dx, vh); ctx.stroke();
    }
    const x = 60 - (1 - k) * 300;
    const ny = nameY(vh);
    // 이름이 대각 구분선을 넘지 않도록 글자 크기를 줄인다
    const avail = nameAvail(vw, vh, !!img);
    const ns = this.nameSize(ctx, avail);
    text(ctx, this.def.title ?? '', x, vh * 0.42, { size: 18, weight: 700, family: FONT.title, color: '#e8c8a8', maxWidth: avail });
    // 금색 밑줄을 먼저 그려 핏방울이 그 위로 흘러내리게
    ctx.fillStyle = GOLD; ctx.fillRect(x, ny + 16, Math.min(320, avail) * k, 3);
    bloodText(ctx, this.bossName, x, ny, { ...NAME_OPTS, size: ns, t: t - 1.4, maxWidth: avail });
    ctx.restore();
    // 건너뛰기 안내 (1.5초부터)
    if (t > 1.5 && out > 0) {
      const S = safeOf(this);
      ctx.save();
      ctx.globalAlpha = clamp((t - 1.5) / 0.3, 0, 1) * out * 0.9;
      hintLine(ctx, [['confirm', '건너뛰기']], '화면을 터치하면 넘어갑니다', vw - 22 - S.r, vh - 16 - S.b, { align: 'right', size: 13, color: '#d8c8b8' });
      ctx.restore();
    }
  }
}

// ═══════════════════════════ 필살기 컷인 ═══════════════════════════
/** 필살기 컷인 시간표 (초, feel §5.3: 전체 0.9초) */
const UC = {
  dur: 0.9, dim: 0.08,
  stripe: 0, stripeIn: 0.14,          // 캐릭터 색 띠 (왼쪽에서)
  band: 0.03, bandIn: 0.16,           // 검은 띠 (오른쪽에서)
  img: 0.07, imgIn: 0.2,              // 초상화 (+18% vw → 0, 이후 -3% vw 흐름, 1.0→1.06 확대)
  name: 0.1, nameIn: 0.18,            // 기술명 (붓글씨)
  cls: 0.14, clsIn: 0.12,             // 직업명
  line: 0.22, lineIn: 0.2,            // 붉은 먹 밑줄
  gleam: 0.16, gleamDur: 0.42,        // 금테 반짝임 (2차 전직)
  out: 0.16,                          // 퇴장: 띠가 가운데 선으로 접히며 사라진다
};
const ANG_BAND = -6 * DEG, ANG_STRIPE = -8.5 * DEG;
/** 초상화 얼굴 위치 (0..1 이미지 좌표; assets/portraits/<id>.webp 800×1134 기준) */
const FACE = { kael: [0.37, 0.2], sera: [0.41, 0.21], victor: [0.5, 0.25], bran: [0.48, 0.2], lia: [0.44, 0.22], azel: [0.37, 0.22] };
const NAME_PX = 50;

// 한 번 굽는 공용 그림: 망점 타일, 왼쪽 어둠 띠
let SPR = null;
function ultSprites() {
  if (SPR || !hasDom()) return SPR;
  const dot = mkCanvas(10, 10), dg = dot.getContext('2d');
  dg.fillStyle = '#000'; dg.beginPath(); dg.arc(5, 5, 2.1, 0, Math.PI * 2); dg.fill();
  const fade = mkCanvas(256, 2), fg = fade.getContext('2d');
  const lg = fg.createLinearGradient(0, 0, 256, 0);
  lg.addColorStop(0, 'rgba(0,0,0,1)'); lg.addColorStop(0.3, 'rgba(0,0,0,0.78)'); lg.addColorStop(0.65, 'rgba(0,0,0,0.3)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
  fg.fillStyle = lg; fg.fillRect(0, 0, 256, 2);
  SPR = { dot, fade, pattern: null };
  return SPR;
}

// 기술명 비트맵 캐시 (기술명·색·해상도·붓글씨 여부별): 스테이지 중 필살기를 다시 써도 캔버스를 새로 만들지 않는다 (feel §8)
const NAME_CACHE = new Map();
const NAME_CACHE_MAX = 8;
let MEASURE = null;
/**
 * 기술명 비트맵: 먹 그림자(3,3) + 6px 먹 테두리 + 흰색→캐릭터 색 채움. 붓글씨가 아직 없으면 FONT.title 900 으로 굽고,
 * 도착하면 장면이 다시 굽는다. 반환 {c, w, h, ox, oy, adv, brush} (w·h·ox·oy·adv 는 논리 px)
 */
function bakeName(str, color, S) {
  const brush = !!UI.faceReady?.('BN Brush');
  const key = `${str}|${color}|${S}|${UI.fontEpoch ?? 0}`; // 글꼴이 늦게 도착하면(세대 변경) 대체 글꼴로 구운 것을 다시 쓰지 않는다
  const hit = NAME_CACHE.get(key + (brush ? '|b' : '|t'));
  if (hit) return hit;
  const fontStr = brush ? `400 ${NAME_PX}px ${FONT.brush}` : `900 ${NAME_PX}px ${FONT.title}`;
  const m = (MEASURE ||= mkCanvas(1, 1).getContext('2d'));
  m.font = fontStr;
  const adv = Math.max(1, m.measureText(str).width);
  const pad = 14;
  const w = adv + pad * 2 + 4, h = NAME_PX * 1.45 + pad * 2;
  const c = mkCanvas(w * S, h * S), g = c.getContext('2d');
  g.scale(S, S);
  g.font = fontStr; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineCap = 'round';
  const ox = pad, oy = pad + NAME_PX * 1.02;
  g.fillStyle = INK_SHADOW; g.strokeStyle = INK_SHADOW; g.lineWidth = 6;
  g.strokeText(str, ox + 3, oy + 3); g.fillText(str, ox + 3, oy + 3);
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeText(str, ox, oy);
  const gr = g.createLinearGradient(0, oy - NAME_PX * 0.85, 0, oy + NAME_PX * 0.08);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.42, '#fffaf0'); gr.addColorStop(1, color);
  g.fillStyle = gr; g.fillText(str, ox, oy);
  const spr = { c, w, h, ox, oy, adv, brush };
  if (brush) NAME_CACHE.delete(key + '|t'); // 붓글씨가 도착했으면 대체 글꼴 비트맵은 버린다
  NAME_CACHE.set(key + (brush ? '|b' : '|t'), spr);
  while (NAME_CACHE.size > NAME_CACHE_MAX) NAME_CACHE.delete(NAME_CACHE.keys().next().value);
  return spr;
}
/** 붉은 먹 밑줄 (가운데가 굵고 양끝이 가는 붓 획, 끝에서 살짝 튕긴다) */
function inkStroke(len) {
  const p = new Path2D(), h = 5;
  p.moveTo(0, 1);
  p.bezierCurveTo(len * 0.25, -h * 1.1, len * 0.62, -h * 0.9, len, -1.5);
  p.lineTo(len + 7, 0.2);
  p.bezierCurveTo(len * 0.64, h * 1.05, len * 0.3, h * 0.95, 0, 2.6);
  p.closePath();
  return p;
}

/** 필살기 컷인 (feel §5.3). 월드는 멈춰 있고(맨 위 장면만 갱신) 이 장면이 그 위에 그린다 */
export class UltCutinScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.hidePad = true; this.deferToasts = true; }
  enter(p = {}) {
    let charId = p.charId;
    if (!CHARACTERS[charId]) { try { charId = new URLSearchParams(location.search).get('char'); } catch { charId = null; } }
    this.ch = CHARACTERS[charId] ?? CHARACTERS.kael;
    this.charId = this.ch.id;
    const world = p.world ?? this.game.world ?? null;
    let classId = p.classId ?? world?.player?.hero?.classId;
    if (!CLASSES[classId]) { try { classId = new URLSearchParams(location.search).get('class') || classId; } catch { /* 주소 없음 */ } }
    const C = CLASSES[classId]?.charId === this.charId ? CLASSES[classId] : CLASSES[this.ch.rootClass];
    this.cls = C ?? null;
    this.tier = clamp(Number(C?.tier) || 0, 0, 2);
    this.col = this.ch.ult?.color ?? '#fff2b0';
    this.skill = this.ch.ult?.name ?? '필살기';
    this.dur = UC.dur;
    // 컷인은 한 번에 하나: 각성 컷인 위에는 뜨지 않는다 (MASTER_PLAN §1.13)
    if (this.game.scenes.some((s) => s !== this && s.name === 'awakenCutin')) this.dur = 0;
    this.face = FACE[this.charId] ?? [0.45, 0.22];
    this.nameSpr = null; this.grad = null; this.gradKey = '';
    this.ink = null; this.inkLen = -1;
    this.popped = false;
    this.calm = !!this.game.settings?.reduceMotion;   // 움직임 줄이기: 속도선 약하게, 확대·흐름 없음
    try { UI.loadBrush?.(); } catch { /* 글꼴 없음: title 로 그린다 */ }
    if (this.dur > 0) {
      audio.sfx('cutin_whoosh');
      this.bake();
    }
  }
  /** 색 띠 채움: 위는 캐릭터 색, 아래로 갈수록 조금 어둡게 (한 번 만든 그라데이션을 다시 쓴다) */
  stripeGrad(ctx, hs) {
    const key = `${Math.round(hs)}|${this.col}`;
    if (this.sgKey !== key) {
      const [r, g, b] = hexToRgb(this.col);
      const dk = (k) => `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
      const gr = ctx.createLinearGradient(0, -hs, 0, hs);
      gr.addColorStop(0, this.col); gr.addColorStop(0.55, dk(0.9)); gr.addColorStop(1, dk(0.68));
      this.sg = gr; this.sgKey = key;
    }
    return this.sg;
  }
  /** 기술명 비트맵을 (다시) 굽는다 — 화면 배율에 맞춘 해상도 */
  bake() {
    if (!hasDom()) return;
    try { this.nameSpr = bakeName(this.skill, this.col, clamp(this.game.scale || 1, 1, 2.5)); } catch (e) { console.error(e); this.nameSpr = null; }
  }
  update(dt) {
    this.game.world?.camera?.tickShake?.(dt);
    if (!this.popped && this.t >= this.dur) { this.popped = true; this.game.pop(); }
  }
  render(ctx) {
    if (!(this.dur > 0)) return;
    const g = this.game, vw = g.viewW, vh = g.viewH, t = Math.min(this.t, this.dur);
    const S = safeOf(this);
    const spr = ultSprites();
    if (this.nameSpr && !this.nameSpr.brush && UI.faceReady?.('BN Brush')) this.bake(); // 붓글씨가 도착했다
    if (alone(this)) { ctx.fillStyle = '#0a0508'; ctx.fillRect(0, 0, vw, vh); }
    const eOut = clamp((t - (this.dur - UC.out)) / UC.out, 0, 1);
    const fadeOut = 1 - eOut * eOut;
    const squash = Math.max(0.12, 1 - 0.88 * ease.inCubic(eOut));
    const cx = vw / 2, cy = vh * 0.5;
    const L = vw * 0.62 + 60;                 // 띠 반 길이 (기울여도 화면 끝을 넘게)
    const hb = vh * 0.19, hs = vh * 0.235;    // 검은 띠·색 띠 반 높이

    ctx.save();
    // 1) 암전
    ctx.fillStyle = `rgba(0,0,0,${(0.5 * clamp(t / UC.dim, 0, 1) * fadeOut).toFixed(3)})`;
    ctx.fillRect(0, 0, vw, vh);
    ctx.globalAlpha = fadeOut;

    // 2) 캐릭터 색 띠 (뒤, 왼쪽에서 들어온다) + 망점
    const k1 = ease.outExpo(clamp((t - UC.stripe) / UC.stripeIn, 0, 1));
    ctx.save();
    ctx.translate(cx - (1 - k1) * vw * 1.25, cy + 6); ctx.rotate(ANG_STRIPE); ctx.scale(1, squash);
    ctx.fillStyle = this.stripeGrad(ctx, hs); ctx.fillRect(-L, -hs, 2 * L, 2 * hs);
    if (spr) {
      if (!spr.pattern) { try { spr.pattern = ctx.createPattern(spr.dot, 'repeat'); } catch { spr.pattern = null; } }
      if (spr.pattern) { ctx.globalAlpha = fadeOut * 0.2; ctx.fillStyle = spr.pattern; ctx.fillRect(-L, -hs, 2 * L, 2 * hs); ctx.globalAlpha = fadeOut; }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L, -hs + 5, 2 * L, 2); ctx.fillRect(-L, hs - 7, 2 * L, 3);
    ctx.restore();

    // 3) 검은 띠 (앞, 오른쪽에서 들어온다): 바탕 → 초상화 → 왼쪽 어둠 → 속도선 (띠 안으로 자른다)
    const k2 = ease.outExpo(clamp((t - UC.band) / UC.bandIn, 0, 1));
    const bx = cx + (1 - k2) * vw * 1.25;
    ctx.save();
    ctx.translate(bx, cy); ctx.rotate(ANG_BAND); ctx.scale(1, squash);
    const gk = `${vw}|${this.col}`;
    if (this.gradKey !== gk) {
      const gr = ctx.createLinearGradient(-L, 0, L, 0);
      gr.addColorStop(0, '#000000'); gr.addColorStop(0.45, '#060206'); gr.addColorStop(1, rgba(this.col, 0.22));
      this.grad = gr; this.gradKey = gk;
    }
    ctx.beginPath(); ctx.rect(-L, -hb, 2 * L, 2 * hb);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.fillStyle = this.grad; ctx.fill();
    ctx.save();
    ctx.clip();
    // 초상화는 똑바로 세워 그린다 (띠 회전·접힘을 되돌림)
    ctx.scale(1, 1 / squash); ctx.rotate(-ANG_BAND); ctx.translate(-bx, -cy);
    this.drawPortrait(ctx, vw, vh, t, bx - cx, spr);
    ctx.translate(bx, cy); ctx.rotate(ANG_BAND); ctx.scale(1, squash);
    // 속도선 (왼쪽으로 1800 px/s)
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.calm ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.13)';
    const span = 2 * L + 240, speed = this.calm ? 500 : 1800;
    for (let i = 0; i < 20; i++) {
      const x = L + 120 - ((i * 137 + t * speed) % span);
      const y = -hb + ((i * 53) % Math.max(1, Math.floor(2 * hb - 4))) + 2;
      ctx.fillRect(x, y, 150 + (i % 4) * 30, i % 3 === 0 ? 3 : 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore(); // 자르기 끝
    // 띠 가장자리: 캐릭터 색 선, 2차 전직은 금테(외곽 굵은 선 + 안쪽 가는 선) + 반짝임
    ctx.fillStyle = this.col;
    ctx.fillRect(-L, -hb, 2 * L, 3); ctx.fillRect(-L, hb - 3, 2 * L, 3);
    if (this.tier >= 2) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(-L, -hb - 4, 2 * L, 4); ctx.fillRect(-L, hb, 2 * L, 4);
      ctx.fillStyle = 'rgba(232,200,114,0.75)';
      ctx.fillRect(-L, -hb + 7, 2 * L, 1.5); ctx.fillRect(-L, hb - 8.5, 2 * L, 1.5);
      const gp = (t - UC.gleam) / UC.gleamDur;
      if (gp > 0 && gp < 1) {
        const gx = -L + 2 * L * ease.inOutQuad(gp);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,248,220,0.85)';
        ctx.fillRect(gx - 60, -hb - 4, 120, 4); ctx.fillRect(-gx - 60, hb, 120, 4);
        ctx.fillStyle = 'rgba(255,240,200,0.35)';
        ctx.fillRect(gx - 140, -hb - 5, 280, 6); ctx.fillRect(-gx - 140, hb - 1, 280, 6);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();

    // 4) 글자: 띠의 최종 자리 기준 (띠와 같은 기울기), 저마다의 시간표로 들어온다
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(ANG_BAND); ctx.scale(1, squash);
    const lx0 = -cx + Math.max(vw * 0.06, 44) + S.l;
    const ly = 16;
    const maxW = vw * 0.47;
    const sp = this.nameSpr;
    const kN = ease.outCubic(clamp((t - UC.name) / UC.nameIn, 0, 1));
    let nameW = Math.min(maxW, NAME_PX * this.skill.length * 0.9);
    if (sp && kN > 0) {
      const fit = sp.adv > maxW ? maxW / sp.adv : 1;
      const s = fit * (1.22 - 0.22 * ease.outBack(kN));
      nameW = sp.adv * fit;
      const nx = lx0 - (1 - kN) * 220;
      ctx.globalAlpha = fadeOut * kN;
      ctx.drawImage(sp.c, nx - sp.ox * s, ly - sp.oy * s, sp.w * s, sp.h * s);
      ctx.globalAlpha = fadeOut;
    }
    // 붉은 먹 밑줄: 왼쪽에서 오른쪽으로 쓸려 나간다
    const pU = ease.outCubic(clamp((t - UC.line) / UC.lineIn, 0, 1));
    if (pU > 0) {
      const len = Math.round(nameW + 26);
      if (this.inkLen !== len) { this.inkLen = len; this.ink = inkStroke(len); }
      const ux = lx0 - 6, uy = ly + 14;
      ctx.save();
      ctx.beginPath(); ctx.rect(ux - 4, uy - 12, (len + 20) * pU, 26); ctx.clip();
      ctx.translate(ux, uy);
      ctx.translate(1.5, 2); ctx.fillStyle = '#4a0008'; ctx.fill(this.ink);
      ctx.translate(-1.5, -2); ctx.fillStyle = INK_RED; ctx.fill(this.ink);
      if (pU > 0.85) {
        ctx.beginPath();
        ctx.arc(len + 12, -5, 2.6, 0, Math.PI * 2); ctx.arc(len + 20, 3, 1.7, 0, Math.PI * 2); ctx.arc(len + 5, 7, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // 직업명 (작게, 기술명 위). 2차 전직은 금색 + 마름모
    const kC = clamp((t - UC.cls) / UC.clsIn, 0, 1);
    const cname = this.cls?.name;
    if (cname && kC > 0) {
      ctx.globalAlpha = fadeOut * kC;
      const cyL = ly - NAME_PX * 0.98;
      let tx = lx0 + (1 - kC) * -40;
      if (this.tier >= 2) {
        ctx.fillStyle = GOLD;
        ctx.beginPath(); ctx.moveTo(tx + 5, cyL - 11); ctx.lineTo(tx + 10, cyL - 6); ctx.lineTo(tx + 5, cyL - 1); ctx.lineTo(tx, cyL - 6); ctx.closePath(); ctx.fill();
        tx += 16;
      }
      text(ctx, cname, tx, cyL, { size: 17, weight: 800, family: FONT.title, color: this.tier >= 2 ? GOLD : this.tier === 1 ? '#f4e6c8' : '#d8c8b0', outline: INK, ow: 4 });
      ctx.globalAlpha = fadeOut;
    }
    ctx.restore();
    ctx.restore();
  }
  /** 초상화 (얼굴을 띠 가운데 줄에): 없으면 캐릭터 색 광채 + 영문 이름으로 대신한다 */
  drawPortrait(ctx, vw, vh, t, slide, spr) {
    const img = assets.get(this.ch.portrait);
    const cy = vh * 0.5;
    const kI = ease.outExpo(clamp((t - UC.img) / UC.imgIn, 0, 1));
    const off = (1 - kI) * 0.18 * vw - (this.calm ? 0 : 0.03 * vw * (t / UC.dur)) + slide * 0.35;
    if (!img || !img.width) {
      ctx.save();
      ctx.globalAlpha *= 0.16 * kI;
      text(ctx, this.ch.eng ?? '', vw * 0.58 + off, cy + 30, { size: 88, weight: 900, family: FONT.logo, align: 'center', color: this.col, outline: null });
      ctx.restore();
      return;
    }
    const [fx, fy] = this.face;
    const pw = Math.max(680 * (vh / 540), 0.62 * vw);
    const ph = pw * img.height / img.width;
    // 얼굴 x: 초상화 오른쪽 끝이 흐름(-3% vw)을 빼도 화면 끝을 넘도록
    const X = vw + 60 - (1 - fx) * pw;
    const faceY = cy - (X - vw / 2) * Math.tan(-ANG_BAND) - vh * 0.02;
    const z = this.calm ? 1 : 1 + 0.06 * clamp(t / UC.dur, 0, 1);
    const dw = pw * z, dh = ph * z;
    const ix = X + off - fx * dw, iy = faceY - fy * dh;
    ctx.drawImage(img, ix, iy, dw, dh);
    // 왼쪽 가장자리 어둠: 검은 띠에 이어 붙고 글자가 읽히게
    if (spr?.fade) ctx.drawImage(spr.fade, 0, 0, 256, 2, ix - 2, cy - vh * 0.5, dw * 0.46, vh);
  }
}

// ═══════════════════════════ 비전서/기록 열람 ═══════════════════════════
/** 비전서/기록물 열람 (uiScale, 안내 글리프) */
export class DocumentScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.deferToasts = true; this.uiScale = true; this.hidePad = true; }
  enter({ docId, loreId } = {}) {
    this.doc = docId ? DOCS[docId] : LORE[loreId];
    this.isDoc = !!docId;
    const w = this.game.world;
    this.prevCut = w ? !!w.cutscene : false;
    if (w) w.cutscene = true;
    this.vg = null; this.vgKey = '';
  }
  exit() { if (this.game.world) this.game.world.cutscene = this.prevCut ?? false; }
  update(dt) {
    this.game.world?.camera?.tickShake?.(dt);
    if (this.t > 0.6 && (input.pressed('confirm') || input.pressed('cancel') || input.pressed('attack') || input.pressed('menu') || input.pointer.tapped)) {
      audio.sfx('menu_cancel');
      this.game.pop();
    }
  }
  /** 양피지 가장자리 그늘 (크기가 바뀔 때만 새 그라데이션) */
  vignetteRect(ctx, x, y, w, h) {
    const key = `${x}|${y}|${w}|${h}`;
    if (this.vgKey !== key) {
      const gr = ctx.createRadialGradient(x + w / 2, y + h / 2, h * 0.3, x + w / 2, y + h / 2, w * 0.7);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,30,0,0.45)');
      this.vg = gr; this.vgKey = key;
    }
    ctx.fillStyle = this.vg; ctx.fillRect(x, y, w, h);
  }
  render(ctx) {
    const [W, H] = viewOf(this), S = safeOf(this);
    ctx.fillStyle = alone(this) ? '#0a0608' : 'rgba(0,0,0,0.7)'; ctx.fillRect(0, 0, W, H);
    const w = Math.min(640, W - 80);
    const h = clamp(H - 72 - S.t - S.b, 300, 400);
    const x = (W - w) / 2;
    const y = S.t + Math.max(10, (H - S.t - S.b - 34 - h) / 2);
    const pk = `${y}|${h}`;
    if (this.pgKey !== pk) { // 양피지 그라데이션: 배치가 바뀔 때만
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#e8dcb8'); g.addColorStop(1, '#c8b890');
      this.pg = g; this.pgKey = pk;
    }
    ctx.fillStyle = this.pg; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3; ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
    this.vignetteRect(ctx, x, y, w, h);
    const d = this.doc || { name: '???', text: '글씨가 번져 읽을 수 없다.' };
    text(ctx, this.isDoc ? '— 비 전 서 —' : '— 기 록 —', W / 2, y + 44, { size: 14, align: 'center', color: '#6a3a1a', outline: null, family: FONT.title, weight: 700 });
    text(ctx, d.name ?? '???', W / 2, y + 80, { size: 26, align: 'center', color: '#3a1a0a', outline: null, family: FONT.title, weight: 800, maxWidth: w - 60 });
    ctx.fillStyle = '#8a2a1a'; ctx.fillRect(W / 2 - 80, y + 92, 160, 2);
    // 본문: 아래 칸(기술·능력치)을 뺀 높이에 들어가도록 글자 크기를 16 → 14 로 줄인다
    const reserve = d.tech ? 92 : d.stats ? 72 : 28;
    const top = y + 128, room = y + h - reserve - top;
    const fk = `${w}|${room}|${UI.fontEpoch}`;
    if (this.fitKey !== fk) { // 배치나 글꼴이 바뀔 때만 다시 잰다 (매 프레임 줄바꿈 측정 없음)
      let size = 16, lineH = 1.6;
      for (const s of [16, 15, 14]) {
        size = s; lineH = s >= 16 ? 1.6 : 1.5;
        const n = wrap(ctx, d.text ?? '', w - 80, s, 700, FONT.title).length;
        if ((n - 1) * s * lineH <= room) break;
      }
      this.fit = { size, lineH, maxLines: Math.max(1, Math.floor(room / (size * lineH)) + 1) };
      this.fitKey = fk;
    }
    const { size, lineH, maxLines } = this.fit;
    paragraph(ctx, d.text ?? '', x + 40, top, w - 80, { size, color: '#2a1a0a', family: FONT.title, weight: 700, lineH, maxLines, outline: null });
    if (d.tech) {
      panel(ctx, x + 40, y + h - 84, w - 80, 56, { fill: 'rgba(60,10,10,0.85)' });
      text(ctx, `습득 기술: ${d.tech.name ?? ''}`, x + 60, y + h - 58, { size: 16, weight: 800, color: '#ffe7a0' });
      const cy = y + h - 36;
      text(ctx, '커맨드:', x + 60, cy, { size: 13, weight: 700, color: '#e8d8c0' });
      ctx.font = font(13, 700, FONT.body);
      const ex = drawCmd(ctx, d.tech.cmd ?? [], x + 60 + ctx.measureText('커맨드:').width + 8, cy, 13, '#ffe0b0');
      const right = x + w - 56;
      if (d.tech.desc && right - ex > 40) text(ctx, d.tech.desc, ex + 10, cy, { size: 13, color: '#e8d8c0', maxWidth: right - ex - 10 });
    } else if (d.stats) {
      text(ctx, '영구 능력치 상승', W / 2, y + h - 62, { size: 13, align: 'center', weight: 700, color: '#6a3a1a', outline: null });
      text(ctx, statsText(d.stats), W / 2, y + h - 38, { size: 17, align: 'center', weight: 800, color: '#8a1a0a', outline: null, maxWidth: w - 80 });
    }
    // 닫기 안내 (지금 기기의 버튼 글리프)
    if (this.t > 0.6) {
      const hy = Math.min(H - 12 - S.b, y + h + 26);
      ctx.save();
      ctx.globalAlpha = clamp((this.t - 0.6) / 0.25, 0, 1);
      hintLine(ctx, [[['confirm', 'cancel'], '닫기']], '화면을 터치하면 돌아갑니다', W / 2, hy, { size: 13, color: '#c8b8a8' });
      ctx.restore();
    }
  }
}
/** 커맨드: 방향은 화살표 글자, 버튼은 지금 기기의 글리프 (없으면 글자). 반환: 끝 x */
function drawCmd(ctx, cmd, x, y, size = 13, color = '#ffe0b0') {
  let cx = x;
  const gh = Math.round(size * 1.45);
  for (const c of cmd) {
    if (typeof c === 'string' && c.startsWith('btn:')) {
      const w = drawGlyph(ctx, c.slice(4), cx, y - Math.round(gh * 0.76), gh);
      if (w > 0) { cx += w + 4; continue; }
    }
    const s = cmdToText([c]);
    text(ctx, s, cx, y, { size, weight: 800, color });
    ctx.font = font(size, 800, FONT.body);
    cx += ctx.measureText(s).width + 4;
  }
  return cx;
}
/** {agi:3, moveSpd:5} → '민첩 +3 · 이동 속도 +5%' */
export function statsText(stats = {}) {
  return Object.entries(stats).map(([k, v]) => `${STAT_INFO[k]?.name ?? k} ${v >= 0 ? '+' : ''}${v}${STAT_INFO[k]?.pct ? '%' : ''}`).join(' · ');
}
export function cmdToText(cmd = []) {
  const m = { u: '↑', d: '↓', f: '→', b: '←', df: '↘', db: '↙', uf: '↗', ub: '↖', 'btn:attack': '공격', 'btn:jump': '점프', 'btn:skill1': '스킬1', 'btn:skill2': '스킬2', 'btn:dash': '대시', 'btn:sub': '보조' };
  return cmd.map((c) => m[c] ?? c).join(' ');
}

// ═══════════════════════════ 게임오버 ═══════════════════════════
const GO_OPTS = { size: 60, t: 0 };
/** 이어하기 화면의 세로 배율: 화면이 낮으면(최소 400) 간격·숫자를 줄여 한 화면에 들어가게 */
const goFit = (H) => clamp((H - 40) / 480, 0.74, 1);
const CONT_OPTS = { size: 30, style: 'gold' };
const GO_ARM = 0.6; // 이어하기·포기 입력을 받기 시작하는 시각 (초)

/** 게임오버 → 아케이드식 CONTINUE 카운트다운 (uiScale, 44 CSS px 버튼, 안내 글리프) */
export class GameOverScene extends Scene {
  constructor(g) { super(g); this.opaque = false; this.uiScale = true; this.hidePad = true; this.deferToasts = true; }
  enter({ world } = {}) {
    this.world = world ?? null;
    this.count = 9.99;
    this.menu = new ListMenu(2, { cols: 2 }); // 버튼이 가로로 놓이므로 ←→ 로 이동
    this.canContinue = (world?.run?.continues ?? 0) > 0;
    this.sec = null; this.secT = 1; this.done = false;
    this.vg = null; this.vgKey = '';
    audio.music('gameover');
    // render 와 같은 크기로 굽는다 (낮은 화면의 이어하기 화면은 52: 모바일에서 첫 프레임에 다시 굽지 않게)
    prewarm(this.game, this.game.uiK, [['GAME OVER', { size: this.titleSize(viewOf(this)[1]) }], this.canContinue ? ['CONTINUE?', CONT_OPTS] : [null]]);
  }
  /** GAME OVER 글자 크기 (enter 의 미리 굽기와 render 가 같은 값을 쓴다) */
  titleSize(H) { return this.canContinue && goFit(H) < 0.9 ? 52 : GO_OPTS.size; }
  update(dt) {
    if (this.done) return;
    if (!this.canContinue) {
      // 크레딧 소진: 2초 뒤부터 아무 입력으로, 8초가 지나면 자동으로 마을로
      if ((this.t > 2 && input.anyPressed()) || this.t > 8) this.giveUp();
      return;
    }
    // 막 뜬 화면(GO_ARM 초)은 입력을 받지 않는다: 쓰러지는 동안 연타하던 점프(=결정 Z)·공격이 곧바로 이어하기·포기로 번지지 않게
    const armed = this.t >= GO_ARM;
    // 공격 연타로 카운트를 빨리 넘긴다 (아케이드)
    this.count -= armed && input.pressed('attack') ? 1 : dt;
    const sec = Math.max(0, Math.ceil(this.count) - 1);
    if (sec !== this.sec) { if (this.sec != null) audio.sfx('clock_tick'); this.sec = sec; this.secT = 0; }
    this.secT += dt;
    // 마우스: 포인터가 움직였을 때만 가리킨 버튼을 고른다 (가만히 둔 커서가 키보드 선택을 되돌리지 않게).
    // 화면이 뜰 때 커서가 이미 '포기' 위에 멈춰 있던 것은 움직임이 아니다 → 입력을 받기 전까지는 자리만 기억한다
    const p = input.pointer;
    if (!armed || this.px === undefined) { this.px = p.x; this.py = p.y; }
    if (!armed) return;
    if (p.active && (p.x !== this.px || p.y !== this.py)) {
      this.px = p.x; this.py = p.y;
      const over = taps.over(this);
      if (over === 'go_cont' || over === 'go_quit') this.menu.index = over === 'go_cont' ? 0 : 1;
    }
    const r = this.menu.update(dt);
    if (this.menu.moved) audio.sfx('menu_move');
    const hit = taps.hit(this);
    if (hit === 'go_cont' || hit === 'go_quit') {
      const i = hit === 'go_cont' ? 0 : 1;
      // 터치: 선택되지 않은 버튼은 첫 탭에 고르기만 (포기를 실수로 누르지 않게), 고른 버튼을 다시 탭하면 결정
      if (input.touchMode && this.menu.index !== i) { this.menu.index = i; audio.sfx('menu_move'); }
      else { this.menu.index = i; this.choose(); return; }
    } else if (r === 'confirm') { this.choose(); return; }
    if (this.count <= 0) this.giveUp();
  }
  choose() { if (this.menu.index === 0) this.cont(); else this.giveUp(); }
  cont() {
    const w = this.world;
    if (!w) { this.giveUp(); return; }
    this.done = true;
    audio.sfx('coin_insert');
    w.run.continues--;
    w.run.score = 0; // 아케이드 규칙: 컨티뉴 시 점수 초기화
    w.nextExtraLife = 30000; // 1UP 기준점도 점수와 함께 처음부터
    this.game.pop();
    w.respawn(true);
    audio.music(w.bossActive ? (w.boss?.def?.music ?? 'boss') : (w.room?.music ?? w.stage?.music));
  }
  giveUp() {
    this.done = true;
    const w = this.world, st = this.game.state;
    if (!w || !st) { this.game.go('title', {}); return; }
    if (w.diff?.lives) st.lives = w.diff.lives;
    // 기록 등록
    try { this.game.recordScore?.(w.run?.score ?? 0, w.stage?.id); } catch (e) { console.error(e); }
    try { saves.write(st.slot, st); } catch (e) { console.error(e); }
    // from = 스테이지 id → 마을은 동쪽 성문 앞에서 시작 (hub.js: 도착 이유가 처음 방문·이어하기가 아니면 성문)
    this.game.go(this.game.registry.hub ? 'hub' : 'title', { from: w.stage?.id ?? 'stage' });
  }
  /** 가장자리 붉은 그늘 (크기가 바뀔 때만 새 그라데이션) */
  vignette(ctx, W, H) {
    const key = `${W}|${H}`;
    if (this.vgKey !== key) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
      gr.addColorStop(0, 'rgba(60,0,0,0)'); gr.addColorStop(1, 'rgba(60,0,0,0.8)');
      this.vg = gr; this.vgKey = key;
    }
    ctx.fillStyle = this.vg; ctx.fillRect(0, 0, W, H);
  }
  render(ctx) {
    const [W, H] = viewOf(this), S = safeOf(this), t = this.t;
    if (alone(this)) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
    ctx.fillStyle = `rgba(20,0,4,${Math.min(0.8, t)})`; ctx.fillRect(0, 0, W, H);
    this.vignette(ctx, W, H);
    const hintY = H - 14 - S.b;
    if (!this.canContinue) {
      bloodText(ctx, 'GAME OVER', W / 2, H * 0.34, { size: this.titleSize(H), t });
      text(ctx, '크레딧이 모두 소진되었습니다… 마을로 돌아갑니다', W / 2, H * 0.34 + 110, { size: 18, align: 'center', color: '#e8d8c0', maxWidth: W - 60 });
      if (t > 2 && Math.floor(t * 2) % 2 === 0) hintLine(ctx, [['confirm', '마을로 돌아가기']], '화면을 터치하면 마을로 돌아갑니다', W / 2, Math.min(hintY, H * 0.34 + 170), { size: 15, color: COLORS.dim });
      return;
    }
    // 세로 배치: 화면이 낮으면(최소 400) 간격·숫자를 줄여 한 화면에 들어가게
    const f = goFit(H);
    const titleSize = this.titleSize(H);
    const g1 = 70 * f, g2 = 96 * f, g3 = 32 * f, g4 = 22 * f, bh = tapH(this);
    const numSize = Math.round(90 * f);
    const total = titleSize * 0.75 + g1 + g2 + g3 + g4 + bh;
    const avail = H - S.b - 34 - S.t - 10;
    const y1 = S.t + 10 + Math.max(0, (avail - total) * 0.45) + titleSize * 0.75;
    bloodText(ctx, 'GAME OVER', W / 2, y1, { size: titleSize, t });
    const y2 = y1 + g1;
    bloodText(ctx, 'CONTINUE?', W / 2, y2, CONT_OPTS);
    // 카운트다운: 초가 바뀔 때마다 튀어 오른다, 3 이하는 붉게 깜빡임
    const y3 = y2 + g2;
    const sec = this.sec ?? 9;
    const pop = 1 + 0.28 * (1 - ease.outCubic(clamp(this.secT / 0.2, 0, 1)));
    const warn = sec <= 3;
    ctx.save();
    ctx.translate(W / 2, y3 - numSize * 0.35); ctx.scale(pop, pop);
    text(ctx, String(sec), 0, numSize * 0.35, { size: numSize, align: 'center', weight: 900, family: FONT.num, color: warn && Math.floor(t * 4) % 2 === 0 ? '#ff5a5a' : '#fff', ow: 6 });
    ctx.restore();
    const y4 = y3 + g3;
    text(ctx, `남은 크레딧: ${this.world?.run?.continues ?? 0}   (컨티뉴 시 점수 초기화)`, W / 2, y4, { size: 14, align: 'center', color: COLORS.dim });
    const bw = Math.min(220, (W - 80) / 2), by = y4 + g4;
    ctx.save();
    ctx.globalAlpha = clamp(t / GO_ARM, 0.3, 1); // 입력을 받기 전(GO_ARM)에는 버튼이 흐리게 떠오른다
    // 강조는 실제 선택(menu.index)만: 가만히 있는 커서 밑의 버튼까지 강조되면 두 버튼이 함께 골라진 것처럼 보인다
    // (커서를 움직이면 update 가 그 버튼을 고르므로 마우스로 가리킨 버튼도 그대로 강조된다)
    const ptr = input.pointer, act = ptr.active;
    ptr.active = false;
    try {
      ['이어하기', '포기 (마을로)'].forEach((l, k) => {
        const r = { x: W / 2 - bw - 10 + k * (bw + 20), y: by, w: bw, h: bh };
        button(ctx, r, l, { selected: this.menu.index === k });
        taps.add(k === 0 ? 'go_cont' : 'go_quit', r, { owner: this, kind: 'primary', src: 'gameover' });
      });
    } finally { ptr.active = act; }
    hintLine(ctx, [['dpadH', '선택'], ['confirm', '결정']], '버튼을 눌러 고르세요', W / 2, Math.max(by + bh + 24, hintY), { size: 13, color: COLORS.dim });
    ctx.restore();
  }
}
