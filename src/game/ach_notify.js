// 업적 알림 (docs/specs/achievements.md §6) — owner: ACH-UI
//  main.js loadRest 가 import() 로 받아 initAchNotify(game) 한 번 (없거나 실패해도 부팅은 그대로).
//  - 버스 'achievementUnlocked' {ids, src} 를 대기열에 넣고, 보여도 될 때 game.toast 로 낸다 (토스트 규칙은 core/game.js 그대로)
//    · 'live' 하나·둘: 하나씩 「업적 달성 — 「이름」」 (#ffd070, 3.6초) + 처음 보일 때 효과음 'secret'(pitch 1.2) 한 번
//    · 'live' 셋 이상 (미뤄 둔 사이에 모인 것 포함): 「업적 n개 달성 — 「첫 이름」 외 n−1개」 한 줄
//    · 'retro'·'cloud' (소급): 1.2초 모아(부팅 훑기와 첫 동기화가 겹치면 합친다) 한 줄 「지난 기록으로 업적 n개를 달성했습니다 — …」 5초, 소리 없음.
//      실행마다 한 줄만: 그 뒤에 늦게 끝난 동기화의 소급은 아직 보이는 그 줄의 개수에 더하고(5초 다시), 줄이 이미 사라졌으면 조용히 넘긴다 (srcOf 는 그대로)
//  - 미루기 (0.5초마다 다시 본다 — 대기열이 비면 타이머를 끈다): 보스전(world.bossActive·cutscene, 클리어 전) · 연출 장면이 맨 위
//    (dialogue story bossIntro awakenCutin ultCutin companionJoin results ending credits loading) · 타이틀 인트로·PRESS START ·
//    인게임 메뉴(game.js 가 메뉴에서는 토스트를 숨긴 채 시간을 흘려보내 사라진다) · deferToasts/hideToasts 장면 · 각성 연출(hudHidden)
//  - 업적 화면이 맨 위면 토스트 없이 비운다 (화면이 같은 이벤트를 듣고 목록을 다시 읽어 그 줄을 반짝인다)
//  - 마을에 들어설 때(stageEntered → world.mode 'town') 받을 보상이 있으면 이번 실행에서 한 번: 「업적 보상 k개를 받을 수 있습니다 — …」
//  - 공개: game.achNotify = { srcOf(id), pending(), deferReason(), flush() } (업적 화면의 '지난 기록으로 달성' · 시험)
import { bus } from '../core/events.js';
import { audio } from '../core/audio.js';

const DEFER_TOP = new Set(['dialogue', 'story', 'bossIntro', 'awakenCutin', 'ultCutin', 'companionJoin', 'results', 'ending', 'credits', 'loading', 'menu']);
const COL = '#ffd070', COL_HINT = '#f3e2b8';
const POLL_MS = 500;          // 미룬 동안 다시 보는 간격
const GATHER_MS = 80;         // 연달아 온 달성을 모으는 시간 (같은 프레임의 여러 이벤트 → 셋 이상이면 한 줄)
const RETRO_GATHER = 1200;    // 소급 알림을 모으는 시간 (ms)
const HINT_DELAY = 1500;      // 마을에 들어선 뒤 보상 안내까지 (ms; 입장 배너와 겹치지 않게)
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** 지금 알림을 미뤄야 하는 까닭 (없으면 null) */
export function deferReason(game) {
  const top = game?.top;
  if (!top) return 'none';
  if (DEFER_TOP.has(top.name)) return top.name;
  if (top.name === 'title' && top.mode !== 'menu') return 'title';
  if (top.deferToasts || top.hideToasts) return 'scene';
  const w = game.world;
  if (w && !w.cleared && (w.bossActive || w.cutscene)) return 'boss';
  if (w?.hudHidden) return 'hud';
  return null;
}

class Notifier {
  constructor(game) {
    this.game = game;
    this.live = []; this.retro = new Set(); this.retroAt = 0;
    this.retroAll = new Set(); this.retroToast = null;   // 이번 실행의 소급 요약 줄 (하나뿐)과 거기에 센 업적
    this.src = new Map();          // 업적 id → 이번 실행에서 달성한 경로 ('live'|'retro'|'cloud')
    this.hinted = false; this.hintAt = -1;
    this.timer = null; this.soon = null;
    this.offs = [
      bus.on('achievementUnlocked', (e) => this.onUnlock(e)),
      bus.on('stageEntered', () => { if (!this.hinted) { this.hintAt = now(); this.kick(); } }),
    ];
  }
  srcOf(id) { return this.src.get(id) ?? null; }
  pending() { return this.live.length > 0 || this.retro.size > 0 || this.hintAt >= 0; }
  deferReason() { return deferReason(this.game); }
  onUnlock(e) {
    const ids = (Array.isArray(e?.ids) ? e.ids : []).filter((id) => typeof id === 'string' && id);
    if (!ids.length) return;
    const src = e?.src === 'retro' || e?.src === 'cloud' ? e.src : 'live';
    for (const id of ids) if (!this.src.has(id)) this.src.set(id, src);
    if (src === 'live') this.live.push(...ids);
    else { for (const id of ids) this.retro.add(id); this.retroAt = now(); }
    this.kick();
  }
  /** 곧 한 번 본다 (같은 처리·같은 프레임에 연달아 온 달성을 한 줄로 모으게 잠깐 기다린 뒤) + 미룬 동안 0.5초마다 */
  kick() {
    try {
      if (!this.soon) this.soon = setTimeout(() => { this.soon = null; this.pump(); }, GATHER_MS);
      if (!this.timer) this.timer = setInterval(() => this.pump(), POLL_MS);
    } catch { this.pump(); }
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
  /** 보여도 되면 대기열을 토스트로 (시험은 직접 부른다) */
  pump() {
    try {
      if (!this.pending()) { this.stop(); return; }
      const g = this.game;
      if (g.top?.name === 'achievements') { this.live.length = 0; this.retro.clear(); }   // 화면이 직접 반짝인다
      if (!deferReason(g)) {
        if (this.live.length) this.showLive();
        if (this.retro.size && now() - this.retroAt >= RETRO_GATHER) this.showRetro();
        if (this.hintAt >= 0 && now() - this.hintAt >= HINT_DELAY) this.showHint();
      }
      if (!this.pending()) this.stop();
    } catch (e) { console.warn('[ach-notify]', e); this.live.length = 0; this.retro.clear(); this.hintAt = -1; this.stop(); }
  }
  flush() { this.retroAt = -1e9; if (this.hintAt >= 0) this.hintAt = -1e9; this.pump(); }
  name(id) {
    const defs = this.game.ach?.defs;
    const d = Array.isArray(defs) ? defs.find((x) => x?.id === id) : null;
    return d?.name ?? id;
  }
  showLive() {
    const ids = [...new Set(this.live)];
    this.live.length = 0;
    const g = this.game;
    if (ids.length >= 3) g.toast(`업적 ${ids.length}개 달성 — 「${this.name(ids[0])}」 외 ${ids.length - 1}개`, COL, 3.6);
    else for (const id of ids) g.toast(`업적 달성 — 「${this.name(id)}」`, COL, 3.6);
    try { audio.sfx('secret', { pitch: 1.2 }); } catch { /* 소리 없음 */ }
  }
  showRetro() {
    const g = this.game, prev = this.retroToast, i = prev && Array.isArray(g.toasts) ? g.toasts.indexOf(prev) : -1;
    const ids = [...this.retro];
    this.retro.clear();
    if (prev && i < 0) return;   // 이번 실행의 요약 줄은 이미 떴다 사라졌다 — 두 번째 줄은 내지 않는다 (업적 화면이 '지난 기록으로 달성' 을 보여 준다)
    for (const id of ids) this.retroAll.add(id);
    const text = `지난 기록으로 업적 ${this.retroAll.size}개를 달성했습니다 — 「업적」 화면에서 확인하세요`;
    if (i >= 0) {
      // 아직 보이는(또는 줄을 기다리는) 그 줄을 새 개수로 바꾼다: 5초 다시, 지난 시간은 그대로 (다시 페이드인하지 않게) — 새 객체라 글 폭 캐시도 새로
      g.toasts[i] = this.retroToast = { text, color: COL, t: 5, max: 5 + Math.max(0, (prev.max ?? 5) - (prev.t ?? 5)), shown: prev.shown };
      return;
    }
    g.toast(text, COL, 5);
    const last = Array.isArray(g.toasts) ? g.toasts[g.toasts.length - 1] : null;
    this.retroToast = last?.text === text ? last : { text };   // 토스트 목록을 못 읽으면 '이미 떴다' 로만 기억
  }
  showHint() {
    this.hintAt = -1;
    const g = this.game, A = g.ach;
    if (!A || g.world?.mode !== 'town') return;   // 마을이 아니면 다음 입장 때 다시
    let k = 0, ok = false;
    try { k = Number(A.summary?.()?.claimable) || 0; ok = !!A.canClaim?.()?.ok; } catch { k = 0; }
    if (k > 0 && ok) {
      this.hinted = true;
      g.toast(`업적 보상 ${k}개를 받을 수 있습니다 — 메뉴의 「기록」에서 「업적」을 고르세요`, COL_HINT, 4.5);
    }
  }
}

/** 알림기를 한 번만 만든다 → game.achNotify */
export function initAchNotify(game) {
  if (!game) return null;
  if (game.achNotify) return game.achNotify;
  game.achNotify = new Notifier(game);
  return game.achNotify;
}
