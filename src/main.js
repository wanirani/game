// 부트스트랩: 설정/메타 로드 → 게임 초기화 → 플랫폼 셸 → 장면 등록 → 퀘스트·동료 → 폰트 대기 → 타이틀
// 부팅 관문·진행률·오류 화면은 src/boot-gate.js (일반 스크립트, 이 모듈보다 먼저 실행) 가 맡는다: window.__BN_BOOT
import { game } from './core/game.js';
import { audio } from './core/audio.js';
import { assets } from './core/assets.js';
import { saves } from './core/save.js';
import { cloud } from './core/cloud.js';
import { fontsReady } from './core/ui.js';
import { initPlatform } from './core/platform.js';
import { registerScenes } from './scenes/index.js';
import { initQuests } from './game/quests.js';
import { initCompanions, applyCompanionDebug } from './game/companion_events.js'; // [hook:cmp]

const BOOT = typeof window !== 'undefined' ? window.__BN_BOOT : null;
// 동료 디버그 매개변수 (companions §8): ?scene=hub&cmp=all&ch=8 처럼 쓰면 임시 세이브를 만들어 적용한다
const CMP_DEBUG_KEYS = ['cmp', 'ch', 'mount', 'guards', 'egg', 'cmplv', 'bond'];

async function boot() {
  if (window.__BN_BLOCKED) return; // 지원하지 않는 브라우저: boot-gate.js 가 안내를 띄웠다
  BOOT?.step?.('main');
  const canvas = document.getElementById('screen');
  game.settings = saves.loadSettings();
  game.meta = saves.loadMeta();
  game.audio = audio; game.assets = assets; game.saves = saves;
  game.onSettingsAuto = (st) => saves.saveSettings(st); // 자동 품질 조정 결과를 다음 실행에도 유지
  audio.setVolumes(game.settings.musicVol, game.settings.sfxVol);
  game.init(canvas);
  initPlatform(game); // [hook:plat] 안전 영역·전체 화면·화면 꺼짐 방지·커서·서비스 워커 (game.platform)
  registerScenes(game);
  initQuests(game);
  initCompanions(game); // [hook:cmp] game.companions = {recruit, unlock, evaluate, state} + 버스 구독
  cloud.init(game); // 계정·클라우드 저장 (로그인한 적이 없으면 네트워크 요청 없음)
  game.recordScore = (score, stageId, mode = 'story') => {
    const m = game.meta, st = game.state;
    const run = st?.created ? `${st.slot ?? 1}:${st.created}` : null;
    const e = { score, stageId, charId: st?.charId, diff: st?.difficulty, date: Date.now(), mode, name: st?.name ?? '', run };
    // 같은 스토리 진행(세이브)의 기록은 하나만 남긴다 (스테이지마다 누적 점수로 중복 등록되지 않도록)
    if (run && mode === 'story') {
      const old = m.highScores.filter((h) => h.run === run && (h.mode || 'story') === mode);
      for (const h of old) { e.score = Math.max(e.score, h.score); e.name ||= h.name; }
      m.highScores = m.highScores.filter((h) => !old.includes(h));
    }
    m.highScores.push(e);
    m.highScores.sort((a, b) => b.score - a.score);
    m.highScores = m.highScores.slice(0, 20);
    saves.saveMeta(m);
  };
  const params = new URLSearchParams(location.search);
  game.debug = params.has('debug');
  // 첫 화면 글꼴 (core/ui.js 가 부팅 때 시작한 로딩; 시간 제한이 있어 실패해도 시스템 글꼴로 계속된다)
  try { await fontsReady; } catch { /* 글꼴 실패 무시 */ }
  BOOT?.step?.('fonts');
  const start = params.get('scene');
  // 타이틀 배경은 첫 화면의 일부라 부팅 진행률에 넣어 기다린다 (최대 2.5초, 실패해도 계속: 타이틀이 대체 그림을 그린다)
  if (!start || start === 'title' || !game.registry[start]) {
    await Promise.race([assets.preload(['bg/title']), new Promise((r) => setTimeout(r, 2500))]);
  }
  BOOT?.step?.('title');
  // 영웅 초상화는 첫 화면 뒤에 받는다 (부팅과 대역폭을 다투지 않고 페이지 load 를 늦추지 않게)
  const later = () => assets.preload(['portraits/kael', 'portraits/sera', 'portraits/victor', 'portraits/bran', 'portraits/lia', 'portraits/azel']);
  if (document.readyState === 'complete') setTimeout(later, 0); else window.addEventListener('load', () => setTimeout(later, 0), { once: true });
  game.start();
  if (start && game.registry[start]) {
    const debugState = async () => {
      const { newGameState } = await import('./game/state.js');
      return newGameState({ slot: 1, difficulty: params.get('diff') || 'normal', charId: params.get('char') || 'kael' });
    };
    if (start === 'stage') {
      game.state = await debugState();
      applyCompanionDebug(game.state, params); // [hook:cmp] cmp/mount/guards/ride… (키가 없으면 아무것도 하지 않는다)
      game.go('stage', { stageId: params.get('stage') || 's01', roomId: params.get('room') || null }, { fade: false });
    } else {
      if (start === 'hub' && CMP_DEBUG_KEYS.some((k) => params.has(k))) {
        game.state = await debugState();
        applyCompanionDebug(game.state, params); // [hook:cmp]
      }
      game.go(start, {}, { fade: false });
    }
  } else game.go('title', {}, { fade: false });
  // 첫 장면이 두 번 그려진 뒤 부팅 화면을 걷는다 (검은 캔버스가 비치지 않게 서서히 사라진다)
  await afterFrames(2, 200);
  BOOT?.done?.();
  if (!BOOT) document.getElementById('boot')?.remove();
  window.__game = game;
}
/** rAF n 번 뒤 (탭이 숨어 rAF 가 멈춰도 ms 뒤에는 넘어간다) */
function afterFrames(n, ms) {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (!done) { done = true; resolve(); } };
    const step = (k) => (k <= 0 ? fin() : requestAnimationFrame(() => step(k - 1)));
    step(n);
    setTimeout(fin, ms);
  });
}
boot().catch((e) => {
  // 부팅 중 실패: 부팅 화면이 아직 있으면 오류 화면으로 바꾼다 (이미 시작했으면 콘솔에만)
  if (BOOT && !BOOT.finished) BOOT.fail(e);
  else console.error(e);
});
