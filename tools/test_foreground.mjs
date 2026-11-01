// 전경 (Stage 6 FORE) 테스트 — node 만 (가짜 캔버스): node tools/test_foreground.mjs
//  1) 데이터: 이야기 스테이지 s01–s26(+투기장) 모두 항목이 있고, 테마가 STAGES 의 테마와 같고, 모양 이름이 모두 그릴 수 있는 것이다.
//     모든 테마(THEMES)에 기본값이 있다 (마을 town 은 일부러 없음 = 그리지 않음). 패럴랙스 > 1, 알파 ≤ 0.9.
//  2) 낮음 단계 = 그리기 0 (굽기도 0) · 동작 줄이기 = 그리기 0 · setForegroundEnabled(false) = 그리기 0.
//  3) 중간 단계: 굽기 뒤 그리기 안에서 새 그라데이션·새 캔버스·filter 0 (프레임마다 그라데이션 없음), 보이는 조각은 그린다,
//     한 프레임 drawImage ≤ 8.
//  4) 가리지 않기: 조각과 겹친 주인공·적·탄 → 그 조각 알파가 낮아진다 (HIDE_K 근처). 보스전에서는 조각이 화면 가장자리로 밀린다.
//  5) 같은 방은 늘 같은 배치 (Math.random 을 쓰지 않음).
//  6) 보스 구도 (core/camera.js): 터치면 오른쪽 벽 보스 몸통이 버튼 묶음 밖, 영웅은 화면 15 % 안, 키보드·패드는 예전과 같은 값.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, passes = 0;
const ok = (cond, msg) => { if (cond) passes++; else { fails++; console.log('  ✗ ' + msg); } };
const section = (t) => console.log('▶ ' + t);

const D = await import(path.join(ROOT, 'src/data/foreground.js'));
const F = await import(path.join(ROOT, 'src/render/foreground.js'));
const { STAGES, STAGE_ORDER } = await import(path.join(ROOT, 'src/data/stages.js'));
const { THEMES } = await import(path.join(ROOT, 'src/render/background.js'));

// ── 가짜 캔버스: 호출 수를 센다 ──
const CNT = { grad: 0, canv: 0, draw: 0, filter: 0, calls: [] };
function mockCtx(canvas) {
  const noop = () => {};
  const ctx = {
    canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt', strokeStyle: '#000', fillStyle: '#000',
    imageSmoothingQuality: 'low',
    createLinearGradient() { CNT.grad++; return { addColorStop: noop }; },
    createRadialGradient() { CNT.grad++; return { addColorStop: noop }; },
    drawImage(...a) { CNT.draw++; CNT.calls.push({ a: ctx.globalAlpha, args: a }); },
  };
  for (const k of ['save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'clip', 'fill', 'stroke',
    'fillRect', 'clearRect', 'bezierCurveTo', 'quadraticCurveTo', 'setTransform']) ctx[k] = noop;
  let filter = 'none';
  Object.defineProperty(ctx, 'filter', { get: () => filter, set: (v) => { filter = v; CNT.filter++; } });
  return ctx;
}
function mockCanvas() { CNT.canv++; const c = { width: 0, height: 0 }; const g = mockCtx(c); c.getContext = () => g; return c; }
F.setForegroundCanvasFactory(mockCanvas);

const VW = 960, VH = 726;
const cam = { x: 400, y: 0, zoom: 1, shakeX: 0, shakeY: 0 };
const mkWorld = (q = 'medium', extra = {}) => ({
  qualityNow: () => q, game: { settings: { reduceMotion: false }, viewW: VW, viewH: VH }, hudHidden: true,
  bossActive: false, boss: null, player: { x: -9999, y: 0, w: 32, h: 64 }, entities: [], ...extra,
});

section('1) 데이터: 스테이지·테마·모양');
const shapes = new Set(F.FG_SHAPE_NAMES);
for (const s of D.FG_SHAPES) ok(shapes.has(s), `FG_SHAPES '${s}' has a drawer`);
const story = STAGE_ORDER.filter((id) => /^s\d\d$/.test(id));
ok(story.length >= 26, `story stages listed (${story.length})`);
for (let n = 1; n <= 26; n++) {
  const id = `s${String(n).padStart(2, '0')}`;
  const e = D.FG_STAGES[id];
  ok(!!e, `${id} has a foreground entry`);
  if (!e) continue;
  ok(STAGES[id] && e.theme === STAGES[id].theme, `${id} entry theme '${e.theme}' = stage theme '${STAGES[id]?.theme}'`);
  const sp = D.fgSpec(id, STAGES[id]?.theme);
  ok(sp && sp.top.length + sp.bottom.length > 0, `${id} spec has shapes`);
  for (const s of [...(sp?.top ?? []), ...(sp?.bottom ?? [])]) ok(shapes.has(s), `${id} shape '${s}' drawable`);
  ok(sp && sp.par > 1, `${id} parallax > 1 (${sp?.par})`);
  ok(sp && sp.alpha > 0 && sp.alpha <= 0.9, `${id} alpha in (0, 0.9] (${sp?.alpha})`);
}
for (const th of Object.keys(THEMES)) {
  if (th === 'town') { ok(D.fgSpec('hub', 'town') === null, 'town theme → no foreground'); continue; }
  ok(Object.prototype.hasOwnProperty.call(D.FG_THEMES, th), `theme '${th}' has its own foreground default`);
}
ok(D.fgSpec('nope', 'nope')?.top.length > 0, 'unknown stage/theme falls back to a default');
const rift = D.fgSpec('s22', 'graveyard');
ok(rift.bottom.includes('rubble') && rift.top.includes('rock'), 'Part-2 rift stage s22 mixes rubble/rock');
ok(!D.fgSpec('s22', 'catacombs').top.includes('rock'), 'room theme override drops the stage extra');

section('2) 낮음 · 동작 줄이기 · 끄기 = 그리기 0');
{
  const st = { id: 's01', theme: 'village' }, map = { w: 60, h: 14 };
  const fg = F.createForeground(st, map, THEMES.village);
  ok(!!fg, 'foreground created for s01');
  const b0 = F.FG_STATS.bakes;
  const w = mkWorld('low');
  for (let i = 0; i < 5; i++) fg.update(1 / 60, w);
  ok(F.FG_STATS.bakes === b0, 'low tier: nothing baked');
  const ctx = mockCtx({}); CNT.draw = 0; CNT.grad = 0;
  fg.draw(ctx, cam, VW, VH);
  ok(CNT.draw === 0 && CNT.grad === 0 && fg.stats.draws === 0, `low tier: 0 draws (got ${CNT.draw})`);
  const wr = mkWorld('high'); wr.game.settings.reduceMotion = true;
  fg.update(1 / 60, wr); CNT.draw = 0;
  fg.draw(ctx, cam, VW, VH);
  ok(CNT.draw === 0, `reduceMotion: 0 draws (got ${CNT.draw})`);
  ok(F.createForeground({ id: 'hub', theme: 'town' }, map, THEMES.town) === null, 'town: no foreground object');
}

section('3) 중간: 프레임마다 그라데이션·캔버스 0, 보이는 조각을 그림');
let fgM;
{
  fgM = F.createForeground({ id: 's07', theme: 'alchemy' }, { w: 80, h: 14 }, THEMES.alchemy);
  const w = mkWorld('medium');
  fgM.update(1 / 60, w);
  ok(fgM.baked, 'medium: baked in update (outside draw)');
  ok(F.foregroundBytes() > 0 && F.foregroundBytes() <= 1.5 * 1048576, `atlas bytes ${F.foregroundBytes()} ≤ 1.5 MB`);
  const ctx = mockCtx({});
  CNT.grad = 0; CNT.canv = 0; CNT.filter = 0;
  let total = 0, maxDraw = 0;
  for (let i = 0; i < 400; i++) {
    cam.x = i * 23;
    fgM.update(1 / 60, w);
    CNT.draw = 0;
    fgM.draw(ctx, cam, VW, VH);
    total += CNT.draw; maxDraw = Math.max(maxDraw, CNT.draw);
  }
  ok(CNT.grad === 0, `no gradients created while drawing/updating after bake (got ${CNT.grad})`);
  ok(CNT.canv === 0, `no canvases created after bake (got ${CNT.canv})`);
  ok(CNT.filter === 0, `no ctx.filter set per frame (got ${CNT.filter})`);
  ok(total > 0, `pieces drawn while scrolling (${total} draws over 400 frames)`);
  ok(maxDraw <= 8, `≤ 8 drawImage per frame (max ${maxDraw})`);
  F.setForegroundEnabled(false); CNT.draw = 0; fgM.draw(ctx, cam, VW, VH); ok(CNT.draw === 0, 'setForegroundEnabled(false): 0 draws'); F.setForegroundEnabled(true);
}

section('4) 가리지 않기 (주인공·적·탄) · 보스전 가장자리');
{
  const w = mkWorld('medium');
  const ctx = mockCtx({});
  // 보이는 조각 하나 찾기
  let found = null;
  for (let x = 0; x < 6000 && !found; x += 37) {
    cam.x = x; fgM.update(1 / 60, w); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH);
    if (CNT.calls.length) found = { x, call: CNT.calls[0] };
  }
  ok(!!found, 'found a visible piece');
  if (found) {
    cam.x = found.x;
    const [, , , , , dx, dy, dw, dh] = found.call.args;
    const full = found.call.a;
    // 조각 한가운데에 적을 둔다 (화면 = 월드, 줌 1)
    const foe = { kind: 'enemy', x: cam.x + dx + dw / 2 - 16, y: cam.y + dy + dh / 2 - 16, w: 32, h: 32 };
    const wf = mkWorld('medium', { entities: [foe] });
    for (let i = 0; i < 60; i++) { fgM.update(1 / 60, wf); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
    const c2 = CNT.calls.find((c) => Math.abs(c.args[5] - dx) < 1);
    ok(!c2 || c2.a < full * 0.3, `piece over an enemy fades (alpha ${full.toFixed(2)} → ${c2 ? c2.a.toFixed(2) : 'skipped'})`);
    const shot = { kind: 'projectile', x: foe.x, y: foe.y, w: 8, h: 8 };
    const ws = mkWorld('medium', { entities: [shot] });
    for (let i = 0; i < 60; i++) { fgM.update(1 / 60, ws); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
    const c3 = CNT.calls.find((c) => Math.abs(c.args[5] - dx) < 1);
    ok(!c3 || c3.a < full * 0.3, `piece over a projectile fades (${c3 ? c3.a.toFixed(2) : 'skipped'})`);
    // [verifyB] 보스 예고·위험 지대·적 판정 영역도 가리지 않는다. 일반 효과(파티클 등)·플레이어 판정 영역은 그대로 짙게
    const fadeWith = (ent) => {
      const we = mkWorld('medium', { entities: [ent] });
      for (let i = 0; i < 60; i++) { fgM.update(1 / 60, we); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
      const c = CNT.calls.find((q) => Math.abs(q.args[5] - dx) < 1);
      return c ? c.a : 0;
    };
    const box = { x: foe.x, y: foe.y, w: 32, h: 32 };
    ok(fadeWith({ ...box, kind: 'effect', type: 'band', arrows: false, life: 0.8, maxLife: 0.8 }) < full * 0.3, 'piece over a boss telegraph (a_common Telegraph) fades');
    ok(fadeWith({ ...box, kind: 'hazard', warn: 0.8 }) < full * 0.3, 'piece over a boss hazard zone (b_common Zone) fades');
    ok(fadeWith({ ...box, kind: 'hitbox', attack: { team: 'enemy' } }) < full * 0.3, 'piece over an enemy beam/shockwave (hitbox) fades');
    ok(fadeWith({ ...box, kind: 'effect', life: 0.3 }) > full * 0.9, 'plain effect (particle) does not fade the piece');
    ok(fadeWith({ ...box, kind: 'hitbox', team: 'player' }) > full * 0.9, "player's own skill hitbox does not fade the piece");
    const wh = mkWorld('medium', { player: { x: foe.x, y: foe.y, w: 32, h: 64 } });
    for (let i = 0; i < 60; i++) { fgM.update(1 / 60, wh); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
    const c4 = CNT.calls.find((c) => Math.abs(c.args[5] - dx) < 1);
    ok(!c4 || c4.a < full * 0.3, `piece over the hero fades (${c4 ? c4.a.toFixed(2) : 'skipped'})`);
    // 비켜나면 다시 짙어진다
    for (let i = 0; i < 90; i++) { fgM.update(1 / 60, w); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
    const c5 = CNT.calls.find((c) => Math.abs(c.args[5] - dx) < 1);
    ok(c5 && c5.a > full * 0.9, `piece returns to full alpha when clear (${c5?.a.toFixed(2)})`);
    // 보스전: 조각이 가장자리로 (위 조각은 위로, 아래 조각은 아래로) + 더 옅게
    const wb = mkWorld('medium', { bossActive: true });
    for (let i = 0; i < 180; i++) { fgM.update(1 / 60, wb); CNT.calls.length = 0; fgM.draw(ctx, cam, VW, VH); }
    const c6 = CNT.calls.find((c) => Math.abs(c.args[5] - dx) < 1);
    ok(c6, 'piece still drawn in boss arena');
    if (c6) {
      const top = dy <= 0.5;
      ok(top ? c6.args[6] < dy - dh * 0.4 : c6.args[6] > dy + dh * 0.4, `boss arena pushes the piece to the ${top ? 'top' : 'bottom'} edge (y ${dy.toFixed(0)} → ${c6.args[6].toFixed(0)})`);
      ok(c6.a < full * 0.7, `boss arena alpha lower (${full.toFixed(2)} → ${c6.a.toFixed(2)})`);
    }
  }
}

section('5) 같은 방 = 같은 배치');
{
  const a = F.createForeground({ id: 's16', theme: 'sunken' }, { w: 70, h: 20 }, THEMES.sunken);
  const b = F.createForeground({ id: 's16', theme: 'sunken' }, { w: 70, h: 20 }, THEMES.sunken);
  ok(JSON.stringify(a.pieces) === JSON.stringify(b.pieces), 'deterministic layout');
  const c = F.createForeground({ id: 's16', theme: 'sunken' }, { w: 40, h: 20 }, THEMES.sunken);
  ok(JSON.stringify(a.pieces) !== JSON.stringify(c.pieces), 'different room → different layout');
  ok(a.period > VW + 300, `cycle period ${a.period.toFixed(0)} wider than the view (a piece shows once)`);
}

section('6) 보스 구도 (core/camera.js): 터치면 오른쪽 벽의 보스 몸통이 버튼 묶음 밖 · 키보드는 예전 그대로');
{
  const { Camera, CAM_FLAGS } = await import(path.join(ROOT, 'src/core/camera.js'));
  const { input } = await import(path.join(ROOT, 'src/core/input.js'));
  const { touchpad } = await import(path.join(ROOT, 'src/core/touchpad.js'));
  // 폴드 펼침(960×726) 실제 배치에서 잰 아래쪽 조작 상자 (atmos 캡처 때 touchpad.occupiedRects 로 읽음)
  const RECTS = [[794, 623, 73, 73], [722, 630, 58, 58], [881, 632, 54, 54], [683, 514, 54, 54], [668, 582, 54, 54], [613, 620, 50, 50], [883, 501, 50, 50]].map(([x, y, w, h]) => ({ x, y, w, h }));
  const save = { br: touchpad.bottomReserve, lv: touchpad.layoutVersion, oc: touchpad.occupiedRects, sz: touchpad.stickZone, tm: input.touchMode };
  const run = (touch, safe, heroX = 1476) => {
    input.touchMode = touch; CAM_FLAGS.bossSafe = safe;
    touchpad.bottomReserve = () => (touch ? 0.206 : 0); touchpad.layoutVersion = () => 7; touchpad.occupiedRects = () => RECTS;
    touchpad.stickZone = () => ({ x: 20, y: 520, w: 140, h: 190 });
    const c = new Camera(960, 726);
    c.setBounds(528, 0, 1392, 672); c.floorY = 576;
    const hero = { x: heroX, y: 512, w: 32, h: 64, vx: 0, vy: 0, facing: 1, onGround: true };
    c.boss = { x: 1776, y: 400, w: 96, h: 176, dead: false, hidden: false };
    c.follow(hero, 1 / 60, true);
    for (let i = 0; i < 240; i++) c.follow(hero, 1 / 60);
    return { right: (c.boss.x + c.boss.w - c.x) * c.zoom, heroL: (hero.x - c.x) * c.zoom, heroC: (hero.x + hero.w / 2 - c.x) * c.zoom, x: c.x, y: c.y };
  };
  try {
    const before = run(true, false), after = run(true, true);
    const clusterL = Math.min(...RECTS.map((r) => r.x));
    ok(before.right > clusterL, `touch, old framing: boss body under the cluster (right edge ${before.right.toFixed(0)} > ${clusterL})`);
    ok(after.right <= clusterL, `touch, new framing: boss body left of the cluster (right edge ${after.right.toFixed(0)} ≤ ${clusterL})`);
    ok(after.heroL >= 960 * 0.15 - 1, `touch: hero stays ≥ 15 % from the left edge (${after.heroL.toFixed(0)})`);
    const far = run(true, true, 700), far0 = run(true, false, 700);
    ok(far.heroC >= 960 * 0.15 - 1, `touch, hero far from the boss: hero centre stays ≥ 15 % in (${far.heroC.toFixed(0)})`);
    ok(far.x <= far0.x + 0.5, `touch, hero far from the boss: no extra pull past the old framing (${far.x.toFixed(0)} ≤ ${far0.x.toFixed(0)})`);
    const d0 = run(false, false), d1 = run(false, true);
    ok(d0.x === d1.x && d0.y === d1.y, `keyboard/pad framing unchanged (${d0.x.toFixed(1)},${d0.y.toFixed(1)} = ${d1.x.toFixed(1)},${d1.y.toFixed(1)})`);
    // [verifyB] 왼손 모드: 버튼 묶음이 왼쪽 → 터치 룩어헤드가 거울처럼 (왼쪽을 볼 때 더 앞을 본다). 오른손은 예전 값 그대로
    const { game } = await import(path.join(ROOT, 'src/core/game.js'));
    const gs0 = game.settings;
    const MIR = RECTS.map((r) => ({ x: 960 - r.x - r.w, y: r.y, w: r.w, h: r.h }));
    const look = (lefty, facing) => {
      input.touchMode = true; game.settings = { ...(gs0 || {}), touchLeftHanded: lefty };
      touchpad.bottomReserve = () => 0.206; touchpad.layoutVersion = () => (lefty ? 8 : 7);
      touchpad.occupiedRects = () => (lefty ? MIR : RECTS);
      touchpad.stickZone = () => (lefty ? { x: 800, y: 520, w: 140, h: 190 } : { x: 20, y: 520, w: 140, h: 190 });
      const c = new Camera(960, 726);
      c.setBounds(0, 0, 6000, 672);
      c.follow({ x: 3000, y: 512, w: 32, h: 64, vx: 0, vy: 0, facing, onGround: true }, 1 / 60, true);
      return c.lookX;
    };
    // [verifyB] 보스 구도가 영웅을 반대쪽 버튼 묶음 밑으로 (예전 구도보다 더) 밀지 않는다: 왼손 모드 오른쪽 벽 보스, 오른손 왼쪽 벽 보스
    const frame = (lefty, safe, heroX, bossX, facing) => {
      input.touchMode = true; CAM_FLAGS.bossSafe = safe; game.settings = { ...(gs0 || {}), touchLeftHanded: lefty };
      touchpad.bottomReserve = () => 0.206; touchpad.layoutVersion = () => (lefty ? 18 : 17) + (safe ? 0.5 : 0);
      touchpad.occupiedRects = () => (lefty ? MIR : RECTS);
      touchpad.stickZone = () => (lefty ? { x: 800, y: 520, w: 140, h: 190 } : { x: 20, y: 520, w: 140, h: 190 });
      const c = new Camera(960, 726);
      c.setBounds(528, 0, 1392, 672); c.floorY = 576;
      const hero = { x: heroX, y: 512, w: 32, h: 64, vx: 0, vy: 0, facing, onGround: true };
      c.boss = { x: bossX, y: 400, w: 96, h: 176, dead: false, hidden: false };
      c.follow(hero, 1 / 60, true);
      for (let i = 0; i < 240; i++) c.follow(hero, 1 / 60);
      return { l: (hero.x - c.x) * c.zoom, r: (hero.x + hero.w - c.x) * c.zoom };
    };
    try {
      const clusterR = Math.max(...MIR.map((r) => r.x + r.w)), clusterL = Math.min(...RECTS.map((r) => r.x));
      const a1 = frame(true, true, 1300, 1776, 1), a0 = frame(true, false, 1300, 1776, 1);
      ok(a1.l >= Math.min(a0.l, clusterR) - 0.5, `left-handed, boss at the right wall: hero not pushed under the left cluster (hero left ${a1.l.toFixed(0)}, old ${a0.l.toFixed(0)}, cluster ends ${clusterR})`);
      const b1 = frame(false, true, 1250, 540, -1), b0 = frame(false, false, 1250, 540, -1);
      ok(b1.r <= Math.max(b0.r, clusterL) + 0.5, `right-handed, boss at the left wall: hero not pushed further under the right cluster (hero right ${b1.r.toFixed(0)}, old ${b0.r.toFixed(0)}, cluster from ${clusterL})`);
    } finally { game.settings = gs0; CAM_FLAGS.bossSafe = true; }
    try {
      const rR = look(false, 1), rL = look(false, -1), lL = look(true, -1), lR = look(true, 1);
      ok(rR > 40 + 1 && Math.abs(rL + 40) < 1e-6, `right-handed: bias only when facing right (${rR.toFixed(1)}, ${rL.toFixed(1)})`);
      ok(Math.abs(lL + rR) < 1e-6, `left-handed facing left mirrors right-handed facing right (${lL.toFixed(1)} = −${rR.toFixed(1)})`);
      ok(Math.abs(lR - 40) < 1e-6, `left-handed facing right: no cluster bias (${lR.toFixed(1)})`);
    } finally { game.settings = gs0; }
  } finally {
    touchpad.bottomReserve = save.br; touchpad.layoutVersion = save.lv; touchpad.occupiedRects = save.oc; touchpad.stickZone = save.sz;
    input.touchMode = save.tm; CAM_FLAGS.bossSafe = true;
  }
}

console.log(fails ? `✗ test_foreground: ${fails} failed, ${passes} passed` : `✓ test_foreground: ${passes} passed`);
process.exit(fails ? 1 : 0);
