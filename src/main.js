// 부트스트랩: 설정/메타 로드 → 게임 초기화 → 플랫폼 셸 → 타이틀 등록 → 폰트·타이틀 배경 대기 → 타이틀
// 첫 화면(타이틀) 밖의 장면·퀘스트·동료는 import() 로 나중에 받는다 (R1-REQ-229, platform P-09 §9.1: 번들러가 lazy 조각으로 나눈다).
// 그 사이에 다른 장면으로 가면 game.lazyScenes 의 '불러오는 중' 자리 장면이 기다린다. 이 파일의 정적 import 만 첫 조각에 들어간다.
// 부팅 관문·진행률·오류 화면은 src/boot-gate.js (일반 스크립트, 이 모듈보다 먼저 실행) 가 맡는다: window.__BN_BOOT
import { game } from './core/game.js';
import { audio } from './core/audio.js';
import { assets } from './core/assets.js';
import { saves } from './core/save.js';
import { cloud } from './core/cloud.js';
import { fontsReady } from './core/ui.js';
import { initPlatform } from './core/platform.js';
import { telemetry } from './core/telemetry.js';
import { TitleScene } from './scenes/title.js';

const BOOT = typeof window !== 'undefined' ? window.__BN_BOOT : null;
// 동료 디버그 매개변수 (companions §8): ?scene=hub&cmp=all&ch=8 처럼 쓰면 임시 세이브를 만들어 적용한다
const CMP_DEBUG_KEYS = ['cmp', 'ch', 'mount', 'guards', 'egg', 'cmplv', 'bond'];
const TITLE_BG_WAIT = 2500;

/** 첫 화면 밖의 모든 것 (한 번만 등록): 장면 등록부 · 퀘스트 · 동료. game.lazyScenes 가 부르고 실패하면 다시 부른다 */
let rest = null;
async function loadRest(g) {
  const [S, Q, C] = await Promise.all([
    import('./scenes/index.js'),
    import('./game/quests.js'),
    import('./game/companion_events.js'), // [hook:cmp]
  ]);
  if (!rest) {
    S.registerScenes(g);
    Q.initQuests(g);
    C.initCompanions(g); // [hook:cmp] game.companions = {recruit, unlock, evaluate, state} + 버스 구독
    rest = { S, Q, C };
  }
  return rest;
}
/** 브라우저가 한가할 때 (없으면 setTimeout) */
function idle(fn, ms = 1200) {
  const run = () => { try { fn(); } catch (e) { console.warn(e); } };
  setTimeout(() => (typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 4000 }) : run()), ms);
}

async function boot() {
  if (window.__BN_BLOCKED) return; // 지원하지 않는 브라우저: boot-gate.js 가 안내를 띄웠다
  BOOT?.step?.('main');
  const canvas = document.getElementById('screen');
  game.settings = saves.loadSettings();
  game.meta = saves.loadMeta();
  game.audio = audio; game.assets = assets; game.saves = saves;
  game.onSettingsAuto = (st) => saves.saveSettings(st); // 자동 품질 조정 결과를 다음 실행에도 유지
  saves.onFail((f) => game.saveFailed(f)); // 저장 공간 부족·차단: '저장 완료' 대신 경고 (PS-01)
  audio.setVolumes(game.settings.musicVol, game.settings.sfxVol);
  game.init(canvas);
  initPlatform(game); // [hook:plat] 안전 영역·전체 화면·화면 꺼짐 방지·커서·서비스 워커 (game.platform)
  telemetry.init(game); // [hook:plat] 익명 통계·오류 보내기 (game.telemetry; 자동화·로컬·개발 스위치·설정 끔이면 아무것도 하지 않는다, docs/TELEMETRY.md)
  game.register('title', TitleScene); // 나머지 장면은 loadRest (scenes/index.js registerScenes)
  cloud.init(game); // 계정·클라우드 저장 (로그인한 적이 없으면 네트워크 요청 없음)
  game.cloud = cloud; // platform.js 의 저장공간 안내가 로그인(클라우드 백업) 여부를 본다 (cloud.loggedIn)
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
  const start = params.get('scene');
  const direct = !!start && start !== 'title'; // ?scene=stage 등: 나머지 장면이 올 때까지 기다린다
  // 타이틀 배경은 첫 화면의 일부라 글꼴과 함께 일찍 받기 시작한다 (최대 2.5초 기다림, 실패해도 타이틀이 대체 그림을 그린다)
  const bg = direct ? null : Promise.resolve(assets.preload(['bg/title'])).catch(() => null);
  // 나머지 장면: ?scene= 으로 곧바로 가면 지금, 타이틀이면 첫 화면을 그린 뒤 받는다 (느린 연결에서 첫 화면의 글꼴·배경·main 조각과
  // 대역폭을 다투지 않게 — 타이틀에서 다른 장면을 고르면 도착할 때까지 '불러오는 중' 자리 장면이 기다린다)
  const restP = game.lazyScenes(loadRest, { defer: !direct });
  // 첫 화면 글꼴 (core/ui.js 가 부팅 때 시작한 로딩; 시간 제한이 있어 실패해도 시스템 글꼴로 계속된다)
  try { await fontsReady; } catch { /* 글꼴 실패 무시 */ }
  BOOT?.step?.('fonts');
  if (direct && !(await restP)) throw game._lazy?.err ?? new Error('장면을 불러오지 못했습니다');
  if (!direct || !game.registry[start]) {
    await Promise.race([bg ?? Promise.resolve(assets.preload(['bg/title'])).catch(() => null), new Promise((r) => setTimeout(r, TITLE_BG_WAIT))]);
  }
  BOOT?.step?.('title');
  game.start();
  if (direct && game.registry[start]) {
    const debugState = async () => {
      const { newGameState } = await import('./game/state.js');
      return newGameState({ slot: 1, difficulty: params.get('diff') || 'normal', charId: params.get('char') || 'kael' });
    };
    const applyCmp = (st) => rest?.C?.applyCompanionDebug?.(st, params); // [hook:cmp] cmp/mount/guards/ride… (키가 없으면 아무것도 하지 않는다)
    if (start === 'stage') {
      game.state = await debugState();
      applyCmp(game.state); // [hook:cmp]
      game.go('stage', { stageId: params.get('stage') || 's01', roomId: params.get('room') || null }, { fade: false });
    } else {
      if (start === 'hub' && CMP_DEBUG_KEYS.some((k) => params.has(k))) {
        game.state = await debugState();
        applyCmp(game.state); // [hook:cmp]
      }
      game.go(start, {}, { fade: false });
    }
  } else game.go('title', {}, { fade: false });
  window.__game = game;
  // 첫 장면이 두 번 그려진 뒤 부팅 화면을 걷는다 (검은 캔버스가 비치지 않게 서서히 사라진다)
  await afterFrames(2, 200);
  game.loadScenes(); // 타이틀: 첫 화면이 보인 뒤 나머지 장면을 받는다 (그 전에 다른 장면으로 가면 그때 이미 시작했다)
  // 영웅 초상화는 나머지 장면 뒤에 받는다 (부팅과 대역폭을 다투지 않고 페이지 load 를 늦추지 않게)
  const later = () => assets.preload(['portraits/kael', 'portraits/sera', 'portraits/victor', 'portraits/bran', 'portraits/lia', 'portraits/azel']);
  const afterLoad = new Promise((r) => (document.readyState === 'complete' ? r() : window.addEventListener('load', () => r(), { once: true })));
  Promise.all([afterLoad, game.whenScenes()]).then(() => setTimeout(later, 0));
  // 각성 감독(lazy 조각)도 한가할 때 미리 받는다 (FIX-ENGINE 요청 #386: loadAwakenDirectors 는 멱등, 스테이지 입장 때도 받는다)
  game.whenScenes().then((ok) => { if (ok) idle(() => import('./game/awaken.js').then((m) => m.loadAwakenDirectors?.()).catch(() => null)); });
  BOOT?.done?.();
  if (!BOOT) document.getElementById('boot')?.remove();
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
