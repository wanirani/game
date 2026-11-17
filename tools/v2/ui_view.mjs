// v2 interface test page driver (UI lane) - see ui_view.html for the address options.
// Two ways of running the real HUD module (src/v2/ui/index.js), neither touches another lane's code:
//   1) default: import the module here, give it a small stand-in "game" (input recorder, settings, view metrics) and a
//      scripted HudState, and draw it over a capture of the real 3D scene.
//   2) ?live=v2g: open the real game in a same-origin iframe, import the HUD module inside that iframe's realm and plug
//      it into the scene's HUD seam exactly as seams.js UI_LOADER would (scene.hud = hud; scene.hidePad = true).
const Q = new URLSearchParams(location.search);
const view = Q.get('view') || 'play', textSize = Q.get('text') || 'normal', mode = Q.get('mode') || (view === 'kb' ? 'kb' : 'touch');
const freeze = Q.get('freeze') === '1';

if (Q.get('live')) await live(Q.get('live')); else await staged();

async function live(sceneId) {
  const fr = document.getElementById('live'); fr.style.display = 'block';
  document.getElementById('screen').style.display = 'none'; document.getElementById('bg').style.display = 'none';
  fr.src = `/index.html?scene=${encodeURIComponent(sceneId)}`;
  await new Promise((r) => fr.addEventListener('load', r, { once: true }));
  const w = fr.contentWindow;
  for (let i = 0; i < 600 && !(w.__v2 && (w.__v2.ready || w.__v2.error)); i++) await new Promise((r) => setTimeout(r, 100));
  const sc = w.__v2?.scene, g = w.__game;
  if (!sc || !g) { document.getElementById('help').textContent = 'live: scene not ready'; return; }
  const m = await w.eval("import('/src/v2/ui/index.js')");   // the module is evaluated in the game's own realm
  const hud = m.createHud(g, {});
  if (sc.hud && sc.hud !== hud) { try { sc.hud.dispose?.(); } catch { /* built-in */ } }
  sc.hud = hud; sc.showPad = false; sc.hidePad = true;      // what UI_LOADER does (src/v2/game/index.js)
  window.__ui = { live: true, hud, game: g, scene: sc, win: w };
  document.getElementById('help').textContent = 'live: ' + sceneId + ' + src/v2/ui';
}

async function staged() {
  const { createHud } = await import('/src/v2/ui/index.js');
  const cv = document.getElementById('screen'), ctx = cv.getContext('2d'), bg = document.getElementById('bg');
  const dev = Q.get('dev') || (innerWidth / innerHeight > 1.6 ? 'phone2' : 'fold_open'), bgName = Q.get('bg') || 'bright';
  if (bgName === 'white' || bgName === 'black') { bg.style.display = 'none'; document.body.style.background = bgName === 'white' ? '#fff' : '#000'; }
  else { bg.src = `ui_bg/${dev}_${bgName}.jpg`; await bg.decode().catch(() => {}); }

  // ── stand-in game: just what the HUD module reads ──
  const log = [], held = new Set(), queue = new Set();
  const input = {
    mode, _touchVec: { x: 0, y: 0, mag: 0 },
    bindings: { key: { attack: ['KeyZ'], jump: ['Space'], dash: ['ShiftLeft'], guard: ['ShiftLeft'], skill1: ['KeyX'], ult: ['KeyC'], lock: ['Tab'], interact: ['KeyE'], confirm: ['Enter'], menu: ['Escape'] }, pad: { attack: [2], jump: [0], dash: [1], skill1: [3], ult: [5], lock: [4], interact: [3], confirm: [0], menu: [9] } },
    touch: {
      set(a, on) { for (const k of String(a).split(',')) { if (on) held.add(k); else held.delete(k); } log.push([on ? 'down' : 'up', String(a)]); if (log.length > 400) log.shift(); },
      tap(a) { log.push(['tap', String(a)]); },
      axis(x, y) { const v = input._touchVec; v.x = x; v.y = y; v.mag = Math.min(1, Math.hypot(x, y)); if (x || y) log.push(['axis', +x.toFixed(2), +y.toFixed(2)]); if (log.length > 400) log.shift(); },
      clear() { held.clear(); },
    },
    pressed(a) { return queue.has(a); }, down(a) { return held.has(a); },
  };
  const KEYS = { Enter: 'confirm', KeyZ: 'attack', Space: 'jump', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'menu', Backspace: 'cancel' };
  addEventListener('keydown', (e) => { const a = KEYS[e.code]; if (a) { queue.add(a); e.preventDefault(); } });
  const game = { input, settings: { textSize, touchScale: Number(Q.get('tscale')) || 1, touchOpacity: 0.95 }, canvas: cv, registry: {}, viewW: 960, viewH: 540, scale: 1, cssScale: 1, canvasRect: { x: 0, y: 0, w: innerWidth, h: innerHeight }, safeCss: { l: 0, t: 0, r: 0, b: 0 } };
  const safe = { l: 0, t: 0, r: 0, b: 0 };
  const INS = (Q.get('inset') || '0,0,0,0').split(',').map(Number);   // simulated safe-area insets in CSS px: l,t,r,b (safeArea = full)
  game.safeCss = { l: INS[0] || 0, t: INS[1] || 0, r: INS[2] || 0, b: INS[3] || 0 };
  function resize() {
    const W = innerWidth, H = innerHeight, asp = W / H;                 // the same view rule as src/core/game.js (tall view)
    if (asp >= 16 / 9) { game.viewH = 540; game.viewW = Math.round(540 * asp); } else { game.viewW = 960; game.viewH = Math.min(760, Math.round(960 / asp)); }
    const dpr = Math.min(devicePixelRatio || 1, Number(Q.get('dpr')) || 2);
    cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
    game.scale = cv.width / game.viewW; game.cssScale = H / game.viewH; game.canvasRect = { x: 0, y: 0, w: W, h: H };
    S.viewW = game.viewW; S.viewH = game.viewH; S.scale = game.scale;
    const c = game.cssScale, q = game.safeCss; safe.l = q.l / c; safe.t = q.t / c; safe.r = q.r / c; safe.b = q.b / c;
  }

  // ── scripted HudState (the shape of docs/v2/UI_API.md 1) ──
  const numbers = []; for (let i = 0; i < 16; i++) numbers.push({ on: false, x: 0, y: 0, z: 0, str: '', color: '#fff', t: 0, big: false });
  const hero = { hp: 78, dead: false, lock: null, lockT: 0 };
  const S = {
    viewW: 960, viewH: 540, safe, scale: 1, time: 0, hero, heroHpMax: 100,
    candles: { lit: 3.6, max: 5 }, resonance: { value: 1.6, cells: 3 }, night: 'now', moon: { phase: 0.35 },
    area: { id: 'eshville', name: '에슈빌', era: 'now' }, section: { id: 'street', label: '큰길' },
    enemies: [], boss: null, numbers, numberN: 0, prompts: null, pad: null, dialog: null,
    project(x, y, z, out) { out.x = x; out.y = z - y; out.w = 880; return out; },
    done: false, doneT: 0, loading: false, message: '', message2: '', debug: false,
  };
  resize();
  const vw = () => S.viewW, vh = () => S.viewH;
  const E = (id, fx, fz, hp) => ({ id, x: vw() * fx, y: 0, z: vh() * fz, h: 96, hp, hpMax: 100, dead: false, state: 'idle' });
  const hud = createHud(game, {
    assetBase: '/assets/v2/ui/gem/', portraitBase: '/assets/v2/portraits/', forceShow: mode === 'touch', forceMode: mode, mouse: Q.get('mouse') === '1' || !('ontouchstart' in window),
    loadBrush: () => { const f = new FontFace('BN Brush', 'url(/assets/fonts/bn-brush.woff2)'); document.fonts.add(f); return f.load(); },
  });
  await document.fonts.load('700 20px "Noto Sans KR"').catch(() => {}); await document.fonts.load('800 20px "Hahmlet"').catch(() => {});
  await document.fonts.load('700 20px "BN Brush"').catch(() => {});
  hud.resize();

  let spawnT = 0, k = 0;
  const spawn = (fx, fz, y, str, big, color = '#fff', t = 0) => { const n = numbers[k++ % numbers.length]; n.on = true; n.x = vw() * fx; n.z = vh() * fz; n.y = y; n.str = str; n.big = big; n.color = color; n.t = t; };
  function setup() {
    if (view === 'empty') { S.candles = { lit: 3, max: 3 }; S.resonance = { value: 0, cells: 3 }; S.moon = null; return; }
    S.enemies = [E(1, 0.62, 0.66, 100), E(2, 0.47, 0.5, 46), E(3, 0.74, 0.55, 72)]; hero.lock = 1;
    if (view === 'boss' || view === 'states') { S.boss = { name: '밴시 여왕', sub: '배웅의 납골당', hp: 640, hpMax: 1000, stagger: 0.45 }; S.candles = { lit: 5.4, max: 8 }; S.resonance = { value: 4, cells: 4 }; }
    if (view === 'states') S.pad = { skill: { mode: 'call', cd: 0.62 }, bell: { mode: 'long', charge: 0.7 }, roll: { disabled: true }, attack: {} };
    if (view === 'many' || view === 'night') { S.candles = { lit: 11.5, max: 16 }; S.resonance = { value: 5, cells: 5 }; S.night = 'past'; S.area = { id: 'eshville_past', name: '에슈빌', era: 'past' }; S.moon = { phase: 1 }; }
    if (view === 'kb' || view === 'padk' || view === 'play') S.prompts = [{ action: 'interact', label: '종을 살핀다' }, { action: 'skill1', label: '채찍 걸기' }, { action: 'interact', label: '문을 연다', x: vw() * 0.5, y: 0, z: vh() * 0.44 }];
    if (view === 'dialog') hud.showDialog({ speaker: '엘리제', portrait: 'elise', text: '종이 울리면 그 밤으로 건너가요. 돌아올 길은 종소리가 닿는 데까지예요.\n촛불을 아끼세요, 사냥꾼. 밤은 길고 우리는 아직 첫 종도 울리지 못했어요.', onDone() { log.push(['dialog', 'done']); } });
    if (view === 'choice') hud.showDialog({ speaker: '알베르토 신부', portrait: 'alberto', side: 'left', text: '그 밤으로 건너가겠나? 종이 식기 전에 돌아와야 하네.', choices: ['건넌다', '아직 아니다'], onChoice(i) { log.push(['dialog', 'choice', i]); } });
    if (view === 'pause') hud.openPause({ onResume() { log.push(['pause', 'resume']); }, onSettings() { log.push(['pause', 'settings']); }, onLeave() { log.push(['pause', 'leave']); } });
    if (view === 'night' || view === 'many') hud.banner('night');
    if (view === 'toast' || view === 'play' || view === 'boss') { hud.toast('은종 조각 ×2', { kind: 'item' }); hud.toast('길종이 울렸다', { kind: 'info', icon: 'bell' }); }
    if (view === 'toast') { hud.toast('촛불이 한 자루 남았다', { kind: 'warn', icon: 'interact' }); hud.banner('area', '안개의 묘지', '오늘 밤'); }
    if (freeze) {
      spawn(0.66, 0.40, 0, '128', false, '#fff', 0.2); spawn(0.47, 0.30, 0, '342', true, '#fff', 0.25); spawn(0.76, 0.36, 0, '96', false, '#fff', 0.3); spawn(0.36, 0.56, 0, '-18', false, '#ff8a80', 0.2);
      hud.callout(vw() * 0.55, 0, vh() * 0.47, '튕겨냄', 'parry'); hud.callout(vw() * 0.27, 0, vh() * 0.42, '막음', 'guard');
    }
  }
  if (freeze) for (let i = 0; i < 260; i++) hud.update(1 / 60, S);    // a frozen capture starts after the place-name banner has gone
  setup();
  for (let i = 0; i < (freeze ? 30 : 2); i++) hud.update(1 / 60, S);   // let banners and toasts fade in
  if (freeze && hud.dialogOpen) { hud.advanceDialog(); hud.update(1 / 60, S); }   // a frozen capture shows the whole page

  let lastT = performance.now(), acc = 0;
  function frame(now) {
    const el = Math.min(0.1, (now - lastT) / 1000); lastT = now; acc += el;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      if (!freeze) {
        S.time += 1 / 60; spawnT -= 1 / 60;
        for (const n of numbers) if (n.on && (n.t += 1 / 60) >= 0.8) n.on = false;
        if (spawnT <= 0 && view !== 'empty' && !hud.modal) {
          spawnT = 0.42; const e = S.enemies[k % 3], crit = k % 5 === 4;
          spawn(e.x / vw(), (e.z - 110) / vh(), 0, String(crit ? 300 + (k * 37) % 90 : 60 + (k * 53) % 90), crit);
          e.hp = Math.max(8, e.hp - 6); if (S.boss) S.boss.hp = Math.max(60, S.boss.hp - (crit ? 40 : 12));
          if (k % 7 === 3) hud.callout(vw() * 0.52, 70, vh() * 0.62, '튕겨냄', 'parry');
          if (k % 11 === 6) { S.candles.lit = Math.max(0.6, S.candles.lit - 0.7); hero.hp -= 10; }
          if (k % 17 === 9) S.candles.lit = S.candles.max;
          S.resonance.value = (S.resonance.value + 0.22) % (S.resonance.cells + 0.6);
        }
        hud.update(1 / 60, S);
      } else hud.update(0, S);
      queue.clear();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(S.scale, 0, 0, S.scale, 0, 0);
    hud.draw(ctx, S);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('resize', () => { resize(); hud.resize(); });
  window.__ui = { hud, game, state: S, log, held, input, view, ready: true, spawn };
}
