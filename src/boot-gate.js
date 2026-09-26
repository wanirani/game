/* 부팅 관문 — owner: PLAT-BOOT (platform.md P-35 브라우저 관문, §6.7 진행률·부팅 오류 화면, P-09)
 *
 * index.html 에서 모듈(src/main.js)보다 먼저 실행되는 일반 스크립트다. 그래서 옛 브라우저에서도 문법 오류 없이 돌도록
 * ES5 문법만 쓴다 (let/const·화살표 함수·템플릿 문자열·?. 금지). CSP script-src 'self' 를 지키려고 인라인이 아닌 파일이다.
 *
 * 1. 관문: structuredClone · 모듈 스크립트 · Array.prototype.at · Object.hasOwn 이 없으면 한국어 안내를 띄우고
 *    window.__BN_BLOCKED = true (main.js 는 이 값을 보고 부팅하지 않는다).
 * 2. 진행률: #boot 에 막대와 "악마성의 문이 열리고 있습니다… 37%". src/ 모듈(PerformanceObserver, 전체 수는
 *    window.__BN_BUILD.modules — 배포 빌드의 build-info.js — 없으면 개발용 추정치), 첫 화면 글꼴, main.js 단계 보고를 합친다.
 * 3. 부팅 오류: game.start() 전에 처리되지 않은 오류·거부된 Promise·모듈 스크립트 로드 실패가 나면
 *    "불러오기에 실패했습니다. 새로고침해 주세요" + [새로고침]. 자세한 내용은 콘솔에 남는다.
 * 4. 20초 넘게 진행률이 멈추면 느린 연결 안내 + [새로고침] (부팅은 계속 기다린다).
 *
 * main.js 쪽 계약: window.__BN_BOOT = { step(name), done(), fail(err), progress() → 0..100, blocked, failed, finished }
 *   step('main')  모든 정적 모듈을 받아 main.js 가 실행되기 시작함     step('fonts') 첫 화면 글꼴 준비 끝
 *   done()        game.start() 직후 — 오류 감시를 끝내고 #boot 를 걷는다
 */
(function () {
  'use strict';
  var w = window, d = document;
  var MSG_LOAD = '악마성의 문이 열리고 있습니다…';
  var MSG_OLD = '이 브라우저에서는 실행할 수 없습니다. Chrome·Safari·Edge 최신 버전을 사용해 주세요';
  var MSG_FAIL = '불러오기에 실패했습니다. 새로고침해 주세요';
  var MSG_SLOW = '연결이 느립니다. 조금 더 기다리거나 새로고침해 주세요';
  var DEV_MODULES = 240;   // 배포 빌드가 아닐 때 main.js 에서 닿는 모듈 수 추정 (2026-09 기준 약 230개)
  var FONT_FILES = 6;      // 첫 화면 글꼴 파일 수 (noto-sans-kr, hahmlet, grenze-gotisch, cinzel, cinzel-decorative-900, bn-num)
  var STALL_MS = 20000;

  var boot = d.getElementById('boot');
  var st = { blocked: false, failed: false, finished: false, main: false, fonts: false, pct: 0, mods: {}, nMods: 0, fontsSeen: {}, nFonts: 0, lastChange: Date.now(), slow: false };
  var timer = 0, observer = null;

  function el(cls) { return boot ? boot.querySelector('.' + cls) : null; }
  function setMsg(text) {
    var s = el('s');
    if (!s) return;
    s.textContent = text;
  }
  function addReload() {
    if (!boot || boot.querySelector('button.reload')) return;
    var b = d.createElement('button');
    b.type = 'button';
    b.className = 'reload';
    b.textContent = '새로고침';
    b.addEventListener('click', function () { try { w.location.reload(); } catch (e) { /* 무시 */ } });
    boot.appendChild(b);
  }

  // ── 1. 관문 ──
  var missing = [];
  try {
    if (typeof w.structuredClone !== 'function') missing.push('structuredClone');
    if (!('noModule' in d.createElement('script'))) missing.push('module scripts');
    if (typeof Array.prototype.at !== 'function') missing.push('Array.prototype.at');
    if (typeof Object.hasOwn !== 'function') missing.push('Object.hasOwn');
    if (typeof w.Promise !== 'function' || typeof w.fetch !== 'function') missing.push('Promise/fetch');
  } catch (e) { missing.push('feature check'); }
  if (missing.length) {
    st.blocked = true;
    w.__BN_BLOCKED = true;
    if (boot) boot.className = (boot.className ? boot.className + ' ' : '') + 'old';
    setMsg(MSG_OLD);
    if (w.console && console.warn) console.warn('[boot] 지원하지 않는 브라우저: ' + missing.join(', '));
  }

  // ── 2. 진행률 ──
  function totalModules() {
    var b = w.__BN_BUILD;
    var n = b && b.modules > 0 ? +b.modules : DEV_MODULES;
    return Math.max(n, st.nMods + 1);
  }
  function compute() {
    var mod = st.main ? 1 : Math.min(1, st.nMods / totalModules());
    var font = st.fonts ? 1 : Math.min(1, st.nFonts / FONT_FILES);
    var p = 3 + 82 * mod + 13 * font;
    if (st.main) p = Math.max(p, 88);
    return Math.min(99, Math.floor(p));
  }
  function render() {
    if (!boot || st.blocked) return;
    var p = st.finished ? 100 : Math.max(st.pct, compute());
    if (p !== st.pct) { st.pct = p; st.lastChange = Date.now(); }
    var bar = el('bar');
    if (bar && bar.firstChild && bar.firstChild.style) bar.firstChild.style.width = p + '%';
    if (!st.failed) {
      var pc = el('pct');
      if (pc) pc.textContent = p + '%';
      else setMsg(MSG_LOAD + ' ' + p + '%');
    }
    if (!st.failed && !st.slow && !st.finished && Date.now() - st.lastChange > STALL_MS) {
      st.slow = true;
      var n = d.createElement('div');
      n.className = 'slow';
      n.textContent = MSG_SLOW;
      boot.appendChild(n);
      addReload();
    }
  }
  function seen(name) {
    if (!name) return;
    var u = String(name).split('#')[0];
    if (/\/src\/[^?]*\.js(\?|$)/.test(u)) {
      u = u.split('?')[0];
      if (!st.mods[u]) { st.mods[u] = 1; st.nMods++; }
    } else if (/\/assets\/fonts\/[^?]*\.woff2(\?|$)/.test(u)) {
      u = u.split('?')[0];
      if (!st.fontsSeen[u]) { st.fontsSeen[u] = 1; st.nFonts++; }
    }
  }
  if (!st.blocked && boot) {
    try {
      if (w.PerformanceObserver) {
        observer = new PerformanceObserver(function (list) {
          var es = list.getEntries();
          for (var i = 0; i < es.length; i++) seen(es[i].name);
        });
        observer.observe({ type: 'resource', buffered: true });
      }
    } catch (e) { observer = null; }
    try {
      var pre = w.performance && performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
      for (var i = 0; i < pre.length; i++) seen(pre[i].name);
    } catch (e) { /* 무시 */ }
    render();
    timer = setInterval(render, 150);
  }

  // ── 3. 부팅 오류 ──
  function fail(err) {
    if (st.failed || st.finished || st.blocked) return;
    st.failed = true;
    if (boot) boot.className = (boot.className ? boot.className + ' ' : '') + 'err';
    setMsg(MSG_FAIL);
    var s = el('slow');
    if (s && s.parentNode) s.parentNode.removeChild(s);
    addReload();
    if (err && typeof err === 'string' && w.console) console.error('[boot] ' + err);
  }
  function onError(ev) {
    if (st.finished) return;
    var t = ev && ev.target;
    if (t && t !== w && t.tagName) {
      // 리소스 로드 실패(캡처 단계): 모듈 스크립트만 치명적이다 (그림·글꼴·미리 받기 실패는 게임이 대체한다)
      if (t.tagName === 'SCRIPT' && t.type === 'module') fail('모듈을 불러오지 못했습니다: ' + (t.src || '(inline)'));
      return;
    }
    fail(ev && (ev.error || ev.message));
  }
  function onRejection(ev) { if (!st.finished) fail(ev && ev.reason); }
  w.addEventListener('error', onError, true);
  w.addEventListener('unhandledrejection', onRejection);

  function finish() {
    if (st.finished) return;
    st.finished = true;
    w.removeEventListener('error', onError, true);
    w.removeEventListener('unhandledrejection', onRejection);
    if (timer) { clearInterval(timer); timer = 0; }
    if (observer) { try { observer.disconnect(); } catch (e) { /* 무시 */ } observer = null; }
    if (!boot) return;
    render();
    boot.className = (boot.className ? boot.className + ' ' : '') + 'done';
    var b = boot;
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 260);
  }

  w.__BN_BOOT = {
    get blocked() { return st.blocked; },
    get failed() { return st.failed; },
    get finished() { return st.finished; },
    step: function (name) {
      if (name === 'main') st.main = true;
      else if (name === 'fonts') { st.main = true; st.fonts = true; }
      if (timer) render();
    },
    progress: function () { return st.finished ? 100 : st.pct; },
    fail: function (err) { if (err && w.console) console.error(err); fail(); },
    done: finish,
  };
})();
