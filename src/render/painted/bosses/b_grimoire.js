// 그리모어 (b_grimoire) — 채색 컷아웃 퍼핏 렌더러
// 부품 (Kling, tools/painted/configs/b_grimoire.json): 앞표지(눈구멍을 뚫어 뒤에 움직이는 눈알) · 등 · 안표지(살 꿰맨 가죽, 뒷판은 어둡게) ·
//   첫 장(찢어진 입 = 종이 테두리 + 위/아래 턱을 따로 잘라 씹는다) · 책배(이빨·발톱) · 흰자 + 세로 동공 홍채 · 촉수 타일 6 + 발톱 끝 ·
//   사슬 타일 4 + 자물쇠 · 낱장 7 · 파편 9
// 움직임은 전부 기존 로직(src/game/bosses/a_grimoire.js)을 읽기만 한다:
//   open(표지 각도 0..1.3) flutter tilt eyeOpen blink lookX lookY elem runeK chainsBroken fury phase facing state stateT
//   flashT dying deathT vx vy leapLanded
// 상태별 표현: idle(떠다님·숨쉬기·깜빡임·촉수 꿈틀) pages(표지 열림·책장 펄럭) summon(룬·보랏빛 연기) spell(원소색 룬 원·원소 입자)
//   beam(눈 확대·발광) slam(닫힌 책 낙하·착지 먹물 튐) bite(입 쩍 벌림 → 돌진 잔상 → 콱 다묾) transform(룬 폭주)
//   1페이즈 '붉은 잉크'(책장·흰자 붉은 틴트, 붉은 잉크가 흘러내림) · 2페이즈 '금단의 장'(사슬이 끊겨 날아가고 끊긴 사슬이 늘어짐,
//   보랏빛 불꽃, 홍채 자홍 틴트, 촉수 4개) · 피격 섬광 · 손상 0~2(구운 균열·찢김 + 단계 상승 파편)
//   death(표지가 찢겨 날아가고 눈알이 빠져 떨어짐 → 입이 발악 → 턱·책장·등이 흩어져 바닥에 떨어짐, 촉수는 먹물로 녹음)
// 절차적 그로테스크 층: 촉수(체인 타일) · 입 속 목구멍(어둠 + 보랏빛) · 끈적한 침 줄 · 먹물/피 방울 → 바닥 튐 · 눈꺼풀 · 룬 원(구운 스프라이트) ·
//   궤도를 도는 채색 낱장 · 보랏빛 불꽃
import { Drawer, Chain, Strand, Particles, DamageState, Shards, halo, puff, rr, hash1, loadRig, pickVariant, quality, makeCanvas } from '../kit.js';

const DIR = 'painted/bosses/b_grimoire';
const ARC = '#b060ff', ARC2 = '#e0b0ff', RED = '#ff4a7a', MAG = '#ff5ad0';
const ELEMC = { fire: '#ff7a2a', ice: '#9fe8ff', thunder: '#bfe0ff' };
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const G = 1.08;          // 그림 배율 (논리 판정 150×178 에 맞춤: 표지 가죽 ≈ 121×189 px)

// 1페이즈 '붉은 잉크': 양피지(노랑) → 핏빛 분홍, 흰 부분 → 분홍. 어두운 글씨·가죽은 그대로
const RED_INK = [
  { when: (h, s, l) => h > 18 && h < 70 && s > 0.12 && l > 0.3, h: 356, s: 0.72, s0: 0.08, l: 0.74 },
  { when: (h, s, l) => s < 0.16 && l > 0.58, h: 356, s0: 0.24, l: 0.86 },
];
// 2페이즈 '금단의 장': 홍채 → 자홍
const FORB = [
  { when: (h, s) => h > 8 && h < 75 && s > 0.2, h: 338, s: 1.1 },
  { when: (h, s) => h > 200 && h < 330 && s > 0.15, h: 305, s: 1.15, l: 1.05 },
];

const PAGES = ['pg0', 'pg1', 'pg2', 'pg3', 'pg4', 'pg5', 'pg6'];
const DEF = {
  glow: '#c070ff',
  outline: { width: 2.0, color: 'rgba(8,4,10,0.9)' },
  parts: {
    cover: { flash: true, cracks: 4, holes: 2, char: 2 },
    inside: { deep: 0.46, cracks: 3, holes: 1 },           // 뒷판 = 어두운 변형
    spine: { flash: true, cracks: 2, holes: 1, char: 1 },
    edge: { flash: true, cracks: 2, holes: 2, stain: '#5a1020' },
    maw: { flash: true, cracks: 3, holes: 3, stain: '#6a1a20', crackMinLum: 150 },
    jawT: { flash: true, cracks: 1, holes: 0, char: 1 },
    jawB: { flash: true, cracks: 1, holes: 0, char: 1 },
    sclera: { noDmg: true, outline: 0 },
    iris: { noDmg: true, outline: 0 },
  },
  prefix: {
    tent: { cracks: 1, holes: 1, char: 1, outline: 1.6 },
    chain: { noDmg: true, outline: 1.2 }, lock: { noDmg: true, outline: 1.4 },
    pg: { noDmg: true, outline: 1.3 }, deb: { noDmg: true, outline: 1.4 },
  },
  tints: {
    red: { rules: RED_INK, levels: ['base', 'dmg1', 'dmg2'], glow: RED, parts: ['maw', 'edge', 'sclera', ...PAGES] },
    forb: { rules: FORB, levels: ['base'], glow: MAG, parts: ['iris'] },
  },
};

// ───────────────────────── 모듈 계약 ─────────────────────────
export default {
  id: 'b_grimoire', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(boss, rig) {
    const tents = [];
    for (let i = 0; i < 4; i++) tents.push({ ch: new Chain(8), P: Array.from({ length: 8 }, () => ({ x: 0, y: 0 })), seed: 1.7 + i * 2.3 });
    return {
      D: new Drawer(), P: new Particles(quality(boss.world?.game).particles), shards: new Shards(48),
      dmg: new DamageState(boss.def?.phases ?? [0.6, 0.3]), q: quality(boss.world?.game), lt: null, pf: 0, jolt: 0,
      tents, trail: [], chainsSeen: !!boss.chainsBroken, stubs: [new Strand(4, 19, { g: 900, damp: 0.92 }), new Strand(4, 19, { g: 900, damp: 0.92 })],
      d: {}, slamSeen: false, lastPhase: boss.phase ?? 0, mawK: 0, C: [0, 0],
    };
  },
  draw(ctx, b, world, rig, st) { drawBoss(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    const cx = b.cx, cy = b.cy;
    let x0 = cx - 270, x1 = cx + 270, y0 = cy - 250, y1 = cy + 260;
    if (b.dying > 0 || st?.shards?.list.length) { x0 = Math.min(x0, b.A.x0 - 40); x1 = Math.max(x1, b.A.x1 + 40); y1 = Math.max(y1, b.A.floor + 20); }
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  lights(L, b, rig, st) {
    if (st.mawK > 0.15 && !(b.dying > 0.8)) L.add(st.C[0], st.C[1], 120 + st.mawK * 60, b.phase >= 1 ? RED : ARC, 0.45 * st.mawK);
  },
  /** 월드 파편(ABoss.spawnDebris)용 채색 조각: 낱장과 표지 파편 */
  debris(i, rig) {
    const names = rig.man.groups.debris; if (!names?.length) return null;
    const p = rig.parts[names[(i * 5) % names.length]], im = p.v.base, k = p.k * 0.9;
    return { size: Math.max(10, (p.r ?? 10) * 1.2), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

// ───────────────────────── 책 좌표계 ─────────────────────────
// 지역 좌표(x = 플레이어 쪽, y = 아래, 논리 px) → 월드. 책 중심 C, 기울기 rot, 좌우 fx
const F = { cx: 0, cy: 0, rot: 0, c: 1, s: 0, fx: 1 };
function setFrame(cx, cy, rot, fx) { F.cx = cx; F.cy = cy; F.rot = rot; F.c = Math.cos(rot); F.s = Math.sin(rot); F.fx = fx; }
function L(lx, ly, out) { const x = F.fx * lx; out[0] = F.cx + F.c * x - F.s * ly; out[1] = F.cy + F.s * x + F.c * ly; return out; }
const _w = [0, 0], _w2 = [0, 0], _w3 = [0, 0];
/** 타일(사슬·촉수) 가운데 이음매 피벗 — 부품 객체에 한 번만 만들어 둔다 (매 프레임 배열을 만들지 않게. 다시 구우면 부품 객체도 새로 생김) */
const mid = (tile) => (tile._mid ??= [(tile.jl[0] + tile.jr[0]) / 2, tile.jl[1]]);
/** 지역 배치로 부품 그리기: 지역 (lx,ly), 지역 회전 lr, 배율 (월드px/텍셀) sx, sy */
function put(D, part, img, pivot, lx, ly, lr, sx, sy, a = 1) {
  L(lx, ly, _w);
  D.part(part, img, pivot, _w[0], _w[1], F.rot + F.fx * lr, F.fx * sx, sy, a);
}

// ───────────────────────── 룬 원 스프라이트 (색별 1회) ─────────────────────────
const _runes = new Map();
function runeSprite(color, inner) {
  const key = color + (inner ? '*' : '');
  let cv = _runes.get(key);
  if (cv) return cv;
  const N = 320, c = N / 2, R = 140;
  cv = makeCanvas(N, N);
  const g = cv.getContext('2d');
  g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
  if (!inner) {
    g.globalAlpha = 0.75; g.lineWidth = 3; g.beginPath(); g.arc(c, c, R, 0, TAU); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, R - 16, 0, TAU); g.stroke();
    g.globalAlpha = 0.95; g.lineWidth = 1.8;
    // 룬 글자 12개: 해시로 고른 획 (글꼴을 쓰지 않는다)
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, gx = c + Math.cos(a) * (R - 8), gy = c + Math.sin(a) * (R - 8);
      g.save(); g.translate(gx, gy); g.rotate(a + PI / 2);
      g.beginPath(); g.moveTo(0, -6); g.lineTo(0, 6);
      for (let j = 0; j < 3; j++) {
        const h = hash1(i * 7.1 + j * 3.3), y0 = -6 + j * 5;
        if (h < 0.33) { g.moveTo(0, y0); g.lineTo(4, y0 + 3); } else if (h < 0.66) { g.moveTo(0, y0); g.lineTo(-4, y0 + 3); } else { g.moveTo(-3, y0 + 1); g.lineTo(3, y0 + 1); }
      }
      g.stroke(); g.restore();
    }
  } else {
    g.globalAlpha = 0.7; g.lineWidth = 2;
    for (const off of [0, PI / 3]) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = off + i / 3 * TAU - PI / 2; g.lineTo(c + Math.cos(a) * (R - 16), c + Math.sin(a) * (R - 16)); } g.closePath(); g.stroke(); }
    g.lineWidth = 1.2; g.beginPath(); g.arc(c, c, (R - 16) * 0.5, 0, TAU); g.stroke();
  }
  _runes.set(key, cv);
  return cv;
}

// ───────────────────────── 메인 그리기 ─────────────────────────
function drawBoss(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts, P = st.P;
  if (st.rig !== rig) { st.rig = rig; }
  const qn = world.game?.settings?.quality ?? 'high';
  if (st.q.name !== qn) st.q = quality(world.game);
  const q = st.q;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, floor = A.floor, t = b.t;
  P.update(dt, floor);
  st.shards.update(dt, floor);
  const dying = b.dying > 0, dT = b.deathT ?? 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const ph = b.phase ?? 0, fury = b.fury ?? 0;
  const tint = ph >= 1 ? 'red' : null, itint = ph >= 2 ? 'forb' : null;
  const soul = ph >= 2 ? MAG : ph >= 1 ? RED : ARC;
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';

  // ── 책 좌표계 ──
  const fx = b.facing >= 0 ? 1 : -1;
  const shake = (st.jolt > 0 ? st.jolt * 4 : 0) + (dying && dT < 1.3 ? Math.min(1, dT * 2) * 3 : 0);
  const cx = b.cx + (shake ? (rr.next() - 0.5) * shake : 0), cy = b.cy + Math.sin(t * 2.2) * 3 + (shake ? (rr.next() - 0.5) * shake : 0);
  const rot = (b.tilt ?? 0) + Math.sin(t * 1.3) * 0.03 + (st.jolt ? (rr.next() - 0.5) * 0.05 * st.jolt : 0);
  setFrame(cx, cy, rot, fx);
  st.C[0] = cx; st.C[1] = cy;
  const d = st.d;
  const open = clamp(b.open ?? 0, 0, 1.3);
  const th = open * PI * 0.62, cw = Math.cos(th);
  const hw = 56 * G, hh = 88 * G;

  // 단계 상승 / 사슬 끊김 / 착지 — 한 번만
  if (up > 0 && !dying) levelBurst(st, cx, cy, up, ph);
  if (b.chainsBroken && !st.chainsSeen) { st.chainsSeen = true; if (!dying) chainBreak(st, rig, cx, cy, hw, fx); }
  if (b.state === 'slam' && b.leapLanded) { if (!st.slamSeen) { st.slamSeen = true; slamBurst(st, cx, b.bottom, floor, ph); } } else st.slamSeen = false;

  // ── 바닥 그림자 ──
  D.begin(ctx);
  const alt = clamp((floor - b.bottom) / 300, 0, 1);
  if (!d.bookGone) D.img(puff('#000000'), 32, 32, cx, floor - 2, 0, 90 * (1 - alt * 0.4) / 32, 14 / 32, 0.55 * (1 - alt * 0.5));
  D.end();
  P.draw(ctx, 0);

  // ── 뒤층: 오라 · 룬 원 · 촉수 · 뒤 낱장 ──
  if (!d.bookGone) {
    if (q.halos) {
      halo(ctx, cx, cy, 200, '#2a0a3a', 0.55);
      halo(ctx, cx, cy, 170, soul, 0.1 + fury * 0.12 + (b.state === 'transform' ? 0.15 : 0));
    }
    runeRing(ctx, D, b, t, cx, cy);
    drawTentacles(ctx, D, b, rig, st, dt, t, lvl, floor, dying, dT);
    orbitPages(D, b, rig, t, 0, tint);
  }

  // ── 책 ──
  if (!d.bookGone) {
    drawBook(ctx, D, b, rig, st, dt, t, lvl, tint, itint, hit, open, cw, hw, hh, dying, dT, soul);
  }
  st.mawK = d.bookGone ? 0 : clamp((open - 0.15) / 0.8, 0, 1) * (cw < 0.97 ? 1 : 0);

  // ── 앞층: 앞 낱장 · 끊긴 사슬 · 불꽃 · 입자 ──
  if (!d.bookGone) {
    orbitPages(D, b, rig, t, 1, tint);
    if (b.chainsBroken && !d.bookGone) chainStubs(ctx, D, rig, st, dt, hw, hh);
    if ((b.chainsBroken || b.state === 'transform' && ph >= 2) && q.flames) {
      D.end();
      for (let i = 0; i < 3; i++) { L((i - 1) * 40 * G, -hh + 6, _w); flame(ctx, _w[0], _w[1], -PI / 2 + rot + (i - 1) * 0.25, (54 + Math.sin(t * 5 + i) * 8) * G, 15 * G, t, ARC, 0.5, i * 2.1, q.flames); }
    }
  }
  ambient(ctx, b, st, dt, t, cx, cy, hw, hh, open, cw, lvl, ph, dying, dT, soul, hit);
  if (dying) death(ctx, D, b, rig, st, dt, dT, cx, cy, hw, hh, cw, tint, itint, lvl, soul);
  st.shards.draw(D);
  D.end();
  P.draw(ctx, 1);
  ctx.imageSmoothingQuality = q0;
}

// ───────────────────────── 책 본체 ─────────────────────────
function drawBook(ctx, D, b, rig, st, dt, t, lvl, tint, itint, hit, open, cw, hw, hh, dying, dT, soul) {
  const R = rig.parts, q = st.q, P = st.P, d = st.d;
  const V = (part, deep = false, tk = tint) => pickVariant(part, lvl, deep, tk);
  const k = R.cover.k * G;                   // 월드px / 텍셀 (표지 기준, 모든 부품 공통 td)
  const breath = 1 + Math.sin(t * 1.7) * 0.012;
  const rec = b.flashT > 0 && !dying;
  const flut = Math.sin(b.flutter ?? 0);
  // 빠른 돌진 잔상 (물어뜯기 · 내려찍기): 표지 발광 실루엣
  const sp = Math.hypot(b.vx ?? 0, b.vy ?? 0), tr = st.trail;
  tr.unshift(F.cx, F.cy, F.rot); if (tr.length > 12) tr.length = 12;
  if (q.smear && sp > 520 && !dying && !d.coverGone) {
    const gi = R.cover.v.glow, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j < 4; j++) {
      const o = j * 3; if (tr.length < o + 3) break;
      const c = Math.cos(tr[o + 2]), s = Math.sin(tr[o + 2]);
      D.img(gi, R.cover.hinge[0], R.cover.hinge[1], tr[o] - c * hw * F.fx, tr[o + 1] - s * hw * F.fx, tr[o + 2], F.fx * k * Math.max(0.15, cw), k, 0.24 / j * clamp((sp - 520) / 500, 0, 1));
    }
    ctx.globalCompositeOperation = op;
  }
  // 1) 뒷판 (안표지의 어두운 변형) — 두께감: 살짝 뒤·아래로
  D.rec = rec;
  put(D, R.inside, V(R.inside, true, null), 'hinge', -hw + 3, 4, 0, k * 1.02, k * breath * 1.02);
  // 2) 책배 (이빨·발톱이 난 종이 뭉치) — 표지 오른쪽 가장자리에 좁게
  const esy = 2 * hh / (R.edge.bot[1] - R.edge.top[1]) * breath, exs = 0.36 + open * 0.12;
  put(D, R.edge, V(R.edge), 'l', hw - 12 + flut * open * 2, 0, 0, esy * exs, esy);
  // 3) 등
  put(D, R.spine, V(R.spine, false, null), 'hinge', -hw + 1, 0, 0, k, k * breath);
  // 4) 첫 장 (찢어진 입) — 표지가 열렸을 때만
  const gap = clamp((open - 0.18) / 0.95, 0, 1.3) * 34 * G + (dying ? 6 + Math.sin(t * 22) * 5 : 0);
  if (cw < 0.97 || dying) {
    const mk = R.maw.k * G * 1.02, mx = 4 * G, my = 2;
    // 종이 테두리 → 목구멍 (턱 사이: 어둠 + 보랏빛) → 턱 (입 모양으로 잘라 둔 위/아래 잇몸·이빨. 벌어지면 찢어진 종이 밖으로 살이 부풀어 나온다)
    D.rec = rec;
    put(D, R.maw, V(R.maw), 'c', mx, my, 0, mk, mk * breath);
    if (gap > 1.5) {
      L(mx, my, _w);
      D.img(puff('#000000'), 32, 32, _w[0], _w[1], F.rot, 30 * G / 32 * 1.6, (gap * 0.75 + 6) / 32 * 1.4, 0.95);
      D.end();
      halo(ctx, _w[0], _w[1], (14 + gap * 0.9) * G, soul, 0.35 + clamp(gap / 30, 0, 1) * 0.4, true);
    }
    const jk = mk * (1 + gap * 0.002);
    D.rec = rec;
    put(D, R.jawB, V(R.jawB, false, null), 'c', mx, my + gap * 0.55, 0, jk, jk);
    D.rec = rec;
    put(D, R.jawT, V(R.jawT, false, null), 'c', mx, my - gap * 0.45, 0, jk, jk);
    // 끈적한 침 줄 (위아래 송곳니 사이, 많이 벌어지면 끊어짐)
    const sa = clamp((gap - 6) / 6, 0, 1) * clamp((34 - gap) / 8, 0, 1);
    if (sa > 0.02 && !(dying && dT > 1.1)) {
      D.end();
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const x = mx + (i ? 14 : -19) * G;
        L(x, my - gap * 0.45 + 4, _w); L(x + (i ? -6 : 7), my + gap * 0.55 - 4, _w2);
        L(x + (i ? 9 : -8) + Math.sin(t * 2 + i) * 3, my + gap * 0.05 + 10 + gap * 0.3, _w3);
        const wv = (i ? 2.4 : 3.2) * clamp(1.3 - gap / 40, 0.5, 1.1);
        ctx.beginPath(); ctx.moveTo(_w[0], _w[1]); ctx.quadraticCurveTo(_w3[0], _w3[1], _w2[0], _w2[1]);
        const ga = ctx.globalAlpha; ctx.globalAlpha = ga * sa;
        ctx.strokeStyle = 'rgba(30,6,34,0.85)'; ctx.lineWidth = wv; ctx.stroke();
        ctx.strokeStyle = 'rgba(210,150,255,0.45)'; ctx.lineWidth = wv * 0.3; ctx.stroke();
        ctx.globalAlpha = ga;
      }
    }
    if (gap > 7 && !dying && rr.next() < dt * 2.5 * q.ambient) { L(mx + rr.range(-18, 18) * G, my - gap * 0.45 + 4, _w); P.emit('blood', _w[0], _w[1], 0, 0, { color: '#2a0630', hi: '#d090ff', hang: rr.range(0.15, 0.4), layer: 1 }); }
  }
  // 5) 눈 (표지 뒤, 표지의 눈구멍으로 보임) + 눈꺼풀
  const C = R.cover, ssy = k * breath * (1 + Math.max(0, Math.sin(th(open))) * 0.05);
  if (cw > 0.12 && !d.coverGone) {
    const csx = k * cw;
    L(-hw, 0, _w);
    D.set(C.hinge[0], C.hinge[1], _w[0], _w[1], F.rot, F.fx * csx, ssy);
    const ctxx = D.ctx, ex = C.eye[0], ey = C.eye[1], tx = 1 / C.k;   // tx = 표지 텍셀 / 논리 px (런타임 밀도에 따라 다름)
    const S = R.sclera, I = R.iris;
    // 흰자 (구멍보다 조금 크게 → 가장자리는 표지가 덮음)
    const ss = 46 * tx / S.w;
    ctxx.drawImage(pickVariant(S, 0, false, tint), ex - S.w * ss / 2 + (b.lookX ?? 0) * 0.18 * tx, ey - S.h * ss / 2 + (b.lookY ?? 0) * 0.12 * tx, S.w * ss, S.h * ss);
    // 홍채 (플레이어를 따라감, 광선 때 커짐)
    const beam = b.state === 'beam' ? clamp(b.stateT / 1.0, 0, 1) : 0;
    const is = (23 + beam * 6) * tx / I.w;
    const ix = ex + (b.lookX ?? 0) * 1.15 * tx, iy = ey + (b.lookY ?? 0) * 0.65 * tx;
    ctxx.drawImage(pickVariant(I, 0, false, itint), ix - I.w * is / 2, iy - I.h * is / 2, I.w * is, I.h * is);
    // 눈꺼풀 (깜빡임 · 가늘게 뜸)
    const close = b.blink > 0 ? 1 : clamp(1.05 - (b.eyeOpen ?? 1), 0, 1) * 0.5 + (dying ? 0 : 0.08);
    lids(ctxx, ex, ey, close, lvl, tx);
    D.end();
    // 광선 · 주문: 눈 발광
    const gk = beam * 1.4 + (b.runeK ?? 0) * 0.2 + (ph(b) >= 2 ? 0.25 : 0);
    if (gk > 0.05 && q.halos) { D.pt(C.hinge[0], C.hinge[1], ix, iy, _w[0], _w[1], F.rot, F.fx * csx, ssy, _w2); halo(ctx, _w2[0], _w2[1], (22 + beam * 34) * G, ph(b) >= 2 ? MAG : ARC, clamp(gk, 0, 1), true); }
  }
  // 6) 앞표지 (경첩 = 등 쪽. 열리면 종이처럼 뒤집혀 안표지가 보인다)
  if (!d.coverGone) {
    L(-hw, 0, _w);
    D.rec = rec;
    if (cw >= 0) {
      D.part(C, V(C, false, null), 'hinge', _w[0], _w[1], F.rot, F.fx * k * Math.max(0.02, cw), ssy, 1);
      glowOver(ctx, D, C, lvl, 'hinge', _w[0], _w[1], F.rot, F.fx * k * Math.max(0.02, cw), ssy, 0.55, st, t, b.state === 'transform', null);
      // 사슬 (2페이즈 전까지 책을 묶고 있음)
      if (!b.chainsBroken && cw > 0.3) chains(ctx, D, rig, st, C, _w[0], _w[1], F.fx * k * cw, ssy, t);
    } else {
      const I2 = R.inside;
      D.part(I2, V(I2, false, null), 'hinge', _w[0], _w[1], F.rot, F.fx * k * Math.min(-0.02, cw), ssy, 1);
      glowOver(ctx, D, I2, lvl, 'hinge', _w[0], _w[1], F.rot, F.fx * k * Math.min(-0.02, cw), ssy, 0.5, st, t, false, null);
    }
  }
  // 손상 발광 (책배 · 첫 장)
  if (cw < 0.97) { L(4 * G, 2, _w); glowOver(ctx, D, R.maw, lvl, 'c', _w[0], _w[1], F.rot, F.fx * R.maw.k * G * 1.02, R.maw.k * G * 1.02, 0.45, st, t + 2, false, tint); }
  // 피격 섬광: 기록된 부품(표지·등·책배·첫 장·턱)을 흰 실루엣으로
  if (b.flashT > 0 && !dying) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.6);
  else { D.rec = false; D.log.length = 0; }
  D.end();
}
function th(open) { return clamp(open, 0, 1.3) * PI * 0.62; }
function ph(b) { return b.phase ?? 0; }

/** 눈꺼풀: 표지 텍셀 공간 (구멍 밖은 표지가 덮으므로 넉넉하게 칠한다). close 0..1 */
function lids(g, ex, ey, close, lvl, tx) {
  if (close <= 0.02) return;
  const u1 = tx / 2;                        // 아래 수치는 td 2 기준 텍셀
  const W = 60 * u1, H = 34 * u1, top = ey - H, bot = ey + H, cu = 12 * u1 * (1 - close * 0.6);
  const yU = lerp(top - 4 * u1, ey + 2 * u1, close), yD = lerp(bot + 4 * u1, ey + 2 * u1, close);
  g.beginPath();
  g.moveTo(ex - W, top - 10 * u1); g.lineTo(ex + W, top - 10 * u1); g.lineTo(ex + W, yU - 6 * u1);
  g.quadraticCurveTo(ex, yU + cu, ex - W, yU - 6 * u1); g.closePath();
  g.fillStyle = lvl >= 2 ? '#3a1226' : '#3b1733'; g.fill();
  g.beginPath();
  g.moveTo(ex - W, bot + 10 * u1); g.lineTo(ex + W, bot + 10 * u1); g.lineTo(ex + W, yD + 4 * u1);
  g.quadraticCurveTo(ex, yD - cu * 0.66, ex - W, yD + 4 * u1); g.closePath();
  g.fillStyle = '#2c0f26'; g.fill();
  // 눈꺼풀 가장자리 (젖은 살 하이라이트 + 속눈썹 가시)
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(ex - W, yU - 6 * u1); g.quadraticCurveTo(ex, yU + cu, ex + W, yU - 6 * u1);
  g.strokeStyle = 'rgba(160,90,150,0.8)'; g.lineWidth = 3 * u1; g.stroke();
  g.strokeStyle = '#120510'; g.lineWidth = 2 * u1;
  g.beginPath();
  for (let i = 0; i < 7; i++) { const u = i / 6, x = ex - W * 0.7 + u * W * 1.4, y = lerp(yU - 4 * u1, yU + cu * 0.8, Math.sin(u * PI)); g.moveTo(x, y); g.lineTo(x + (u - 0.5) * 8 * u1, y + 9 * u1); }
  g.stroke();
}

/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t, boost = false, tint = null) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 || part.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? ((tint && part.gl[tint + '_dmg2']) || part.gl.dmg2) : ((tint && part.gl[tint + '_dmg1']) || part.gl.dmg1);
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (boost ? 1.8 : 1) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사슬 ─────────────────────────
const CH = ['chain0', 'chain1', 'chain2', 'chain3'];
const _cp = Array.from({ length: 8 }, () => [0, 0]);
/** 표지 위를 가로지르는 사슬 (표지 텍셀 공간의 곡선 → 월드 점 → 타일) + 책배 쪽 자물쇠 */
function chains(ctx, D, rig, st, C, hx, hy, sx, sy, t) {
  const R = rig.parts, n = 5, tx = 1 / C.k;
  const ax = C.chA[0] - 3 * tx, ay = C.chA[1], bx = C.chB[0] + 8 * tx, by = C.chB[1] - 2 * tx, mx = (ax + bx) / 2, my = Math.max(ay, by) + 13 * tx;
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * bx, y = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * by;
    D.pt(C.hinge[0], C.hinge[1], x, y, hx, hy, F.rot, sx, sy, _cp[i]);
  }
  const tk = Math.abs(sy) * 1.35;
  for (let i = 0; i < n; i++) {
    const p0 = _cp[i], p1 = _cp[i + 1], tile = R[CH[i % 4]];
    const a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const tl = tile.jr[0] - tile.jl[0], s = len * 1.12 / tl;
    D.part(tile, tile.v.base, mid(tile), (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, a, s, tk * (i % 2 ? 1 : -1) * 0.95, 1);
  }
  const lk = R.lock, e = _cp[n];
  D.part(lk, lk.v.base, 'hang', e[0], e[1], F.rot + Math.sin(t * 2.3) * 0.12 * F.fx, F.fx * tk * 1.2, tk * 1.2, 1);
}
/** 끊긴 사슬 두 가닥이 모서리에서 늘어짐 (verlet) */
function chainStubs(ctx, D, rig, st, dt, hw, hh) {
  const R = rig.parts;
  for (let j = 0; j < 2; j++) {
    const sd = st.stubs[j];
    L(j ? hw + 8 : -hw - 4, (j ? 0.46 : 0.52) * hh, _w);   // 등 · 책배 모서리 (뒷판에 매달림)
    sd.step(dt, _w[0], _w[1]);
    const p = sd.p, k = R.chain0.k * G * 1.3;
    for (let i = 0; i < sd.n - 1; i++) {
      const x0 = p[i * 2], y0 = p[i * 2 + 1], x1 = p[i * 2 + 2], y1 = p[i * 2 + 3];
      const tile = R[CH[(i + j) % 4]], tl = tile.jr[0] - tile.jl[0];
      const a = Math.atan2(y1 - y0, x1 - x0), s = Math.hypot(x1 - x0, y1 - y0) * 1.15 / tl;
      D.part(tile, tile.v.base, mid(tile), (x0 + x1) / 2, (y0 + y1) / 2, a, s, k * (i % 2 ? 1 : -1), 1);
    }
  }
}
function chainBreak(st, rig, cx, cy, hw, fx) {
  const R = rig.parts, P = st.P;
  for (let i = 0; i < 6; i++) {
    const p = R[i === 5 ? 'lock' : CH[i % 4]], a = -PI / 2 + (rr.next() - 0.5) * 2.4, sp = rr.range(260, 520);
    const piv = p.c ?? [(p.jl[0] + p.jr[0]) / 2, p.jl[1]];
    st.shards.spawn(p.v.base, piv[0], piv[1], cx + rr.range(-hw, hw), cy + 30, rr.next() * TAU, p.k * G * 1.3 * rr.sign(), p.k * G * 1.3, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-12, 12), { r: 6, fade: 2.2 });
  }
  P.burst('spark', cx, cy + 30, 16, { speed: 420, color: '#fff0c0' });
  for (const sd of st.stubs) sd.init = false;
}

// ───────────────────────── 촉수 ─────────────────────────
const TENT = ['tent0', 'tent1', 'tent2', 'tent3', 'tent4', 'tent5'];
// 뿌리 (지역 px, G 적용 전) · 기본 방향 (지역 각도: 0 = 플레이어 쪽, PI/2 = 아래) · 등장 페이즈
const TROOT = [[-38, 70, PI / 2 + 0.55, 0], [22, 78, PI / 2 - 0.35, 0], [-60, -24, PI + 0.35, 1], [36, -82, -PI / 2 + 0.45, 2]];
function drawTentacles(ctx, D, b, rig, st, dt, t, lvl, floor, dying, dT) {
  const R = rig.parts, d = st.d, ph0 = ph(b);
  if (d.tentGone) return;
  const n = 6, segL = 23 * G;
  const lash = b.state === 'bite' ? clamp(b.stateT / 0.5, 0, 1) : b.state === 'slam' ? 0.6 : b.state === 'summon' || b.state === 'transform' ? 0.35 : 0;
  const limp = dying ? clamp((dT - 0.8) / 0.4, 0, 1) : 0;
  for (let ti = 0; ti < TROOT.length; ti++) {
    const [rx, ry, base, need] = TROOT[ti];
    if (ph0 < need && !dying) continue;
    const T = st.tents[ti], Pp = T.P, sd = T.seed;
    // 뿌리 → 끝 (지역 각도 누적 + 물결)
    let ax = rx * G, ay = ry * G, a = base;
    const thrash = 1 + (dying ? 2.2 * (1 - limp) : 0) + lash * 0.8 + (b.state === 'transform' ? 1 : 0);
    // 월드 점을 끝(0) → 뿌리(n) 순서로 채운다 (Chain 규약)
    L(ax, ay, _w); Pp[n].x = _w[0]; Pp[n].y = _w[1];
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      a += Math.sin(t * (1.5 + ti * 0.2) + i * 0.75 + sd) * 0.32 * u * thrash + 0.1 * Math.sin(t * 0.7 + sd);
      // 공격: 앞(플레이어 쪽)으로 휘둘러 뻗음 / 사망 후반: 축 늘어짐(아래로)
      const tgt = ti < 2 ? -0.35 : a;
      a = lerp(a, tgt, lash * 0.18 * u);
      a = lerp(a, PI / 2, limp * 0.35);
      ax += Math.cos(a) * segL * (1 - limp * 0.2); ay += Math.sin(a) * segL;
      L(ax, ay, _w);
      const p = Pp[n - i]; p.x = _w[0]; p.y = Math.min(_w[1], floor - 3);
    }
    const Cn = T.ch.set(Pp, n), Fr = Cn.frames();
    const alpha = dying ? clamp(1 - (dT - 1.05) / 0.35, 0, 1) : 1;
    if (alpha <= 0.01) continue;
    for (let s = 0; s < n - 1; s++) {        // 뿌리(n-1) → 끝 쪽
      const fr = Fr[n - 1 - s], tile = R[TENT[Math.min(5, s)]], tl = tile.jr[0] - tile.jl[0];
      const sx = fr.len * 1.28 / tl, sy = sx * (1.05 - s * 0.05) * F.fx;
      D.part(tile, pickVariant(tile, lvl, false, null), mid(tile), fr.x, fr.y, fr.a, sx, sy, alpha);
    }
    const tip = R.tenttip, f0 = Fr[0], tl0 = tip.w - tip.jl[0] - 4;
    const ts = f0.len * 1.25 / tl0 * 1.15;
    D.part(tip, pickVariant(tip, lvl, false, null), 'jl', Pp[1].x, Pp[1].y, f0.a, ts, ts * F.fx * 0.8, alpha);
    // 끝에서 먹물 방울
    if (!dying && rr.next() < dt * (0.35 + lvl * 0.3) * st.q.ambient) st.P.emit('blood', Pp[0].x, Pp[0].y, 0, 0, { color: '#1e0826', hi: '#b070ff', hang: rr.range(0.1, 0.3), layer: 0 });
  }
}

// ───────────────────────── 룬 원 · 낱장 ─────────────────────────
function runeRing(ctx, D, b, t, cx, cy) {
  const k = clamp((b.runeK ?? 0) + (ph(b) >= 1 ? 0.3 : 0), 0, 1);
  if (k < 0.03) return;
  const col = (b.runeK ?? 0) > 0.05 && ELEMC[b.elem] ? ELEMC[b.elem] : ph(b) >= 1 ? '#ff5a8a' : ARC;
  const s = 132 * G / 140 * (0.95 + Math.sin(t * 3) * 0.02), op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(runeSprite(col, false), 160, 160, cx, cy, t * 0.25, s, s, k * 0.9);
  D.img(runeSprite(col, true), 160, 160, cx, cy, -t * 0.8, s, s, k * 0.8);
  ctx.globalCompositeOperation = op;
  D.end();
}
function orbitPages(D, b, rig, t, front, tint) {
  const R = rig.parts, n = 7 + ph(b) * 2;
  for (let i = 0; i < n; i++) {
    const a = t * (0.9 + (i % 3) * 0.15) + (i / n) * TAU, z = Math.sin(a);
    if ((z > 0) !== !!front) continue;
    const lx = Math.cos(a) * (116 + (i % 2) * 26), ly = z * 30 + Math.sin(t * 2 + i) * 12 - 22 + (i % 3) * 26;
    const p = R[PAGES[i % 7]], sc = (0.82 + z * 0.22) * G;
    put(D, p, pickVariant(p, 0, false, tint), 'c', lx, ly, Math.sin(t * 3 + i) * 0.6, p.k * sc, p.k * sc * (0.7 + Math.abs(Math.cos(t * 2.2 + i)) * 0.3), front ? 1 : 0.75);
  }
}

/** 불꽃 혀 (가산 퍼프를 방향으로 늘여 겹침) */
function flame(ctx, x, y, ang, len, w, t, color, a, seed = 0, n = 5) {
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  const img = puff(color, true), img2 = puff(color);
  n = Math.max(2, n | 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), fl = Math.sin(t * 9 + i * 1.7 + seed) * 0.5 + 0.5;
    const aa = ang + Math.sin(t * 5 + i * 2.1 + seed) * 0.25 * u, dd = len * u * (0.8 + fl * 0.3);
    const px = x + Math.cos(aa) * dd, py = y + Math.sin(aa) * dd;
    const ww = w * (1.4 - u) * (0.8 + fl * 0.4), hh = ww * (1.6 - u * 0.4);
    ctx.globalAlpha = ga * a * (1 - u * 0.65);
    ctx.drawImage(i === 0 ? img : img2, px - ww, py - hh, ww * 2, hh * 2);
  }
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
}

// ───────────────────────── 입자 (그리기 전용 난수) ─────────────────────────
function levelBurst(st, cx, cy, level, ph0) {
  const P = st.P;
  P.burst('chip', cx, cy, 12 + level * 6, { speed: 360, angle: -PI / 2, spread: 1.5 });
  P.burst('blood', cx, cy + 20, 10, { speed: 260, angle: -PI / 2, spread: 1.3, color: ph0 >= 1 ? '#5a0612' : '#2a0630', hi: ph0 >= 1 ? '#ff6a7a' : '#d090ff' });
  P.burst('ember', cx, cy, 16, { speed: 200, color: ph0 >= 1 ? RED : ARC });
}
function slamBurst(st, x, y, floor, ph0) {
  const P = st.P;
  P.burst('chip', x, floor - 6, 14, { speed: 380, angle: -PI / 2, spread: 1.2 });
  P.burst('blood', x, floor - 10, 10, { speed: 320, angle: -PI / 2, spread: 1.1, color: ph0 >= 1 ? '#5a0612' : '#1e0826', hi: '#c080ff' });
  P.burst('smoke', x, floor - 10, 6, { speed: 90, jitter: 30, color: '#1a0c24' });
}
function ambient(ctx, b, st, dt, t, cx, cy, hw, hh, open, cw, lvl, ph0, dying, dT, soul, hit) {
  const P = st.P, q = st.q, amb = q.ambient;
  if (hit) {
    P.burst('chip', cx + F.fx * 20, cy, 7, { speed: 300 });
    P.burst('blood', cx + F.fx * 10, cy, 5, { speed: 220, angle: -PI / 2, spread: 1.4, color: ph0 >= 1 ? '#5a0612' : '#2a0630', hi: ph0 >= 1 ? '#ff6a7a' : '#d090ff' });
  }
  if (dying || st.d.bookGone) return;
  // 책배 아래로 흐르는 잉크(1페이즈부터 붉은 잉크)
  if (rr.next() < dt * (0.7 + lvl * 0.6 + ph0 * 0.5) * amb) {
    L(hw - 6 + rr.range(-4, 10), hh - 8, _w);
    P.emit('blood', _w[0], _w[1], 0, 0, { color: ph0 >= 1 ? '#5a0612' : '#1e0618', hi: ph0 >= 1 ? '#ff6a6a' : '#a060d0', hang: rr.range(0.2, 0.6), layer: 1 });
  }
  // 떠다니는 비전 티끌 · 원소 입자
  if (rr.next() < dt * (3 + ph0 * 3) * amb) P.emit('spore', cx + rr.range(-90, 90), cy + rr.range(-90, 90), rr.range(-10, 10), rr.range(-30, -10), { color: ph0 >= 1 ? '#ff8ab0' : ARC2, layer: rr.chance(0.5) ? 0 : 1 });
  const rk = b.runeK ?? 0;
  if (rk > 0.3 && rr.next() < dt * 24 * amb) {
    const a = rr.next() * TAU, r = 120 * G, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (b.elem === 'fire') P.emit('ember', x, y, 0, -60, { color: '#ffb060', layer: 1 });
    else if (b.elem === 'ice') P.emit('spark', x, y, -Math.cos(a) * 80, -Math.sin(a) * 80, { layer: 1 });
    else P.emit('ember', x, y, -Math.cos(a) * 120, -Math.sin(a) * 120, { color: '#dff0ff', layer: 1 });
  }
  if (b.state === 'summon' && rr.next() < dt * 20 * amb) P.emit('smoke', cx + rr.range(-80, 80), cy + rr.range(-40, 60), 0, -40, { color: '#2a0a3a', layer: 0 });
  if (b.state === 'transform' && rr.next() < dt * 30 * amb) P.emit('ember', cx + rr.range(-70, 70), cy + rr.range(-80, 80), rr.range(-60, 60), rr.range(-160, -40), { color: soul, layer: 1 });
  // 열린 첫 장에서 날리는 종이 조각
  if (open > 0.6 && rr.next() < dt * 6 * amb) { L(hw * 0.6, rr.range(-hh, hh) * 0.7, _w); P.emit('chip', _w[0], _w[1], F.fx * rr.range(60, 180), rr.range(-120, 0), { size: rr.range(2, 3.5) }); }
  // 광선: 눈에서 튀는 불티
  if (b.state === 'beam' && b.stateT > 0.6 && rr.next() < dt * 30 * amb) P.emit('ember', cx + F.fx * 12, cy - 4, rr.range(-90, 90), rr.range(-90, 90), { color: ph0 >= 2 ? MAG : ARC2, layer: 1 });
}

// ───────────────────────── 사망 붕괴 ─────────────────────────
function death(ctx, D, b, rig, st, dt, dT, cx, cy, hw, hh, cw, tint, itint, lvl, soul) {
  const R = rig.parts, P = st.P, d = st.d, floorY = b.A.floor;
  const fade = 2.35 - dT;
  const V = (p, tk = tint) => pickVariant(p, 2, false, tk);
  const shard = (p, img, piv, x, y, rot, s, vx, vy, vr, r) => st.shards.spawn(img, piv[0], piv[1], x, y, rot, F.fx * p.k * s, p.k * s, vx, vy, vr, { r, fade, bounce: 0.3 });
  // 0.3 s: 책장 폭발 (낱장이 사방으로)
  if (!d.pages && dT > 0.3) {
    d.pages = true;
    b.world?.fx?.ring?.(cx, cy, { color: soul, r0: 10, r1: 220, life: 0.5, width: 8 });
    for (let i = 0; i < 9; i++) {
      const p = R[PAGES[i % 7]], a = -PI / 2 + (rr.next() - 0.5) * 2.8, sp = rr.range(240, 520);
      shard(p, V(p), p.c, cx, cy, rr.next() * TAU, G * rr.range(0.9, 1.2), Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-9, 9), 8);
    }
    P.burst('chip', cx, cy, 20, { speed: 380 });
    P.burst('blood', cx, cy, 14, { speed: 320, angle: -PI / 2, spread: 1.5, color: '#2a0630', hi: '#d090ff' });
    P.burst('ember', cx, cy, 24, { speed: 260, color: soul });
  }
  // 0.55 s: 앞표지가 찢겨 날아가고 눈알이 빠져 떨어진다
  if (!d.coverGone && dT > 0.55) {
    d.coverGone = true;
    const C = cw >= 0 ? R.cover : R.inside;
    L(-hw, 0, _w);
    st.shards.spawn(V(C, null), C.hinge[0], C.hinge[1], _w[0], _w[1], F.rot, F.fx * C.k * G * (cw >= 0 ? 1 : -1), C.k * G, -F.fx * rr.range(160, 260), -420, -F.fx * 5, { r: 40, fade, bounce: 0.25 });
    L(0, -4, _w2);
    const S = R.sclera, I = R.iris;
    st.shards.spawn(pickVariant(S, 0, false, tint), S.c[0], S.c[1], _w2[0], _w2[1], 0, S.k * G * 0.9, S.k * G * 0.9, F.fx * rr.range(60, 160), -280, rr.range(-4, 4), { r: 20, fade, bounce: 0.45 });
    st.shards.spawn(pickVariant(I, 0, false, itint), I.c[0], I.c[1], _w2[0] + F.fx * 4, _w2[1], 0, I.k * G * 1.1, I.k * G * 1.1, F.fx * rr.range(80, 180), -300, rr.range(-6, 6), { r: 10, fade, bounce: 0.4 });
    if (!b.chainsBroken) for (let i = 0; i < 4; i++) { const p = R[CH[i]]; st.shards.spawn(p.v.base, (p.jl[0] + p.jr[0]) / 2, p.jl[1], _w2[0] + rr.range(-50, 50), _w2[1] + 30, rr.next() * TAU, p.k * G * 1.3, p.k * G * 1.3, rr.range(-200, 200), rr.range(-360, -120), rr.range(-10, 10), { r: 6, fade }); }
    P.burst('blood', _w2[0], _w2[1], 18, { speed: 340, angle: -PI / 2, spread: 1.4, color: '#4a0620', hi: '#ff70b0' });
    P.burst('ember', _w2[0], _w2[1], 20, { speed: 240, color: soul });
  }
  // 1.2 s: 턱·첫 장·책배·등·뒷판이 흩어져 떨어진다, 촉수는 먹물로
  if (!d.bookGone && dT > 1.2) {
    d.bookGone = true; d.tentGone = true;
    const mk = R.maw.k * G * 1.02;
    L(4 * G, 2, _w);
    const parts = [[R.maw, 'c', 0, 0, mk / R.maw.k], [R.jawT, 'c', 0, -20, mk / R.jawT.k], [R.jawB, 'c', 0, 24, mk / R.jawB.k]];
    for (const [p, pv, ox, oy, s] of parts) st.shards.spawn(V(p, p === R.maw ? tint : null), p[pv][0], p[pv][1], _w[0] + ox, _w[1] + oy, F.rot, F.fx * p.k * s, p.k * s, rr.range(-160, 160), rr.range(-380, -160), rr.range(-5, 5), { r: 26, fade, bounce: 0.3 });
    L(hw, 0, _w); st.shards.spawn(V(R.edge), R.edge.l[0], R.edge.l[1], _w[0], _w[1], F.rot, F.fx * R.edge.k * G * 0.4, R.edge.k * G, F.fx * rr.range(120, 240), -260, F.fx * 3, { r: 30, fade });
    L(-hw, 0, _w); st.shards.spawn(V(R.spine, null), R.spine.hinge[0], R.spine.hinge[1], _w[0], _w[1], F.rot, F.fx * R.spine.k * G, R.spine.k * G, -F.fx * rr.range(80, 200), -220, -F.fx * 2, { r: 30, fade });
    for (let i = 0; i < 6; i++) { const p = R[TENT[i]]; st.shards.spawn(pickVariant(p, 2, false, null), (p.jl[0] + p.jr[0]) / 2, p.jl[1], cx + rr.range(-90, 90), cy + rr.range(40, 120), rr.next() * TAU, p.k * G, p.k * G, rr.range(-120, 120), rr.range(-200, -40), rr.range(-6, 6), { r: 10, fade }); }
    P.burst('blood', cx, cy + 30, 22, { speed: 300, spread: 3.1, color: '#1e0826', hi: '#b070ff' });
    P.burst('smoke', cx, cy, 10, { speed: 80, jitter: 40, color: '#1a0c24' });
    b.world?.fx?.ring?.(cx, cy, { color: '#ffffff', r0: 10, r1: 160, life: 0.4, width: 5 });
  }
  if (dT > 1.2 && dT < 2.2 && rr.next() < dt * 16) P.emit('ashLight', cx + rr.range(-120, 120), cy + rr.range(-60, 80), rr.range(-20, 20), rr.range(-40, 10), { layer: 1 });
  if (dT > 0.55 && dT < 1.2 && rr.next() < dt * 20) { L(4 * G, 2, _w); P.emit('blood', _w[0] + rr.range(-20, 20), _w[1] + 10, rr.range(-60, 60), rr.range(-120, 0), { color: '#2a0630', hi: '#d090ff', layer: 1 }); }
  void floorY;
}
