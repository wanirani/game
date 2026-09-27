// 레비아탄 (b_leviathan) — 채색 컷아웃 퍼핏 렌더러 (ART-BOSS-3)
// 부품 (Kling, tools/painted/configs/b_leviathan.json): 뼈 뿔 왕관의 머리(경첩 턱, 목구멍은 뚫고 절차적으로 메움) ·
//   곧게 그린 몸통(등가시·칠성장어·따개비·찢긴 상처) 을 로직의 30 마디 곡선을 따라 띠로 구부려 그림(길이 방향으로 무늬 반복) ·
//   등지느러미 4종 · 가슴지느러미 · 꼬리지느러미(꼬리 내려치기, 도약 끝) · 파편 5종
// 로직(src/game/bosses/b_leviathan.js)의 값을 읽기만 한다:
//   sx/sy/sa/sr (마디), hx/hy/ha, jaw, mouthGlow, bio, enrage, phase, mode('neck'|'arc'), sub, tail{x,y,a,k,warn}, tailX,
//   facing, state, flashT, dying, A.floor, ripples(paintBack), paintFoam/paintWarnEdge (수면 거품·가장자리 경고는 로직의 그리기 함수를 그대로 부른다)
// 절차적 층: 생물발광 반점(bio 맥동, 3페이즈 분홍) · 수면 클립 · 물방울/침 · 입 속 수압포 충전 빛 · 분노 틴트(dmg2) · 사망(피·비늘 파편, 가라앉음)
import { Drawer, Particles, DamageState, Shards, halo, puff, rr, loadRig, pickVariant, quality, QUALITY } from '../kit.js';
import { warnRect } from '../../../game/bosses/b_common.js';

const DIR = 'painted/bosses/b_leviathan';
const BIO = '#5fe8ff', BIO2 = '#ff4f9a', WATER = '#6fd8ff';
const PI = Math.PI, TAU = PI * 2;
const RMAX = 45;   // 로직 마디 반지름 최대 (segR) ↔ 몸통 그림 띠의 반 높이
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** 실제 품질 등급: 설정 기본값 'auto' 면 품질 조절기가 정한 game.quality (settings.quality 만 보면 폰에서도 늘 'high'). 등급이 없으면 kit.quality */
const tierOf = (game) => { const t = game?.quality ?? game?.tier ?? game?.settings?.quality; return QUALITY[t] ? t : quality(game).name; };
const qualityOf = (game) => QUALITY[tierOf(game)];

// 3페이즈 분노: 청록 발광(지느러미 막·반점) → 선홍/분홍, 나머지는 살짝 어둡게
const RAGE = [
  { when: (h, s, l) => h > 160 && h < 212 && s > 0.3 && l > 0.5, h: 334, s: 1.1, l: 0.95 },
  { when: () => true, dh: 0, s: 0.95, l: 0.9 },
];
const DEF = {
  glow: BIO,
  outline: { width: 2.0, color: 'rgba(4,10,12,0.9)' },
  parts: {
    head: { flash: true, cracks: 3, holes: 1, crackMinLum: 120 },
    jaw: { flash: true, cracks: 1, holes: 0 },
    body: { flash: true, cracks: 4, holes: 2, char: 2, crackMinLum: 90, outline: 1.4 },
    pec: { deep: 0.62, membrane: true, holes: 2, cracks: 0 },
    fluke: { flash: true, membrane: true, holes: 2, cracks: 1 },
  },
  prefix: { fin: { membrane: true, holes: 1, cracks: 0, outline: 1.6 }, deb: { noDmg: true, outline: 1.2 } },
  tints: { rage: { rules: RAGE, levels: ['dmg2'], glow: BIO2, skip: ['deb'] } },
};

export default {
  id: 'b_leviathan', kind: 'boss', ownsDeathFade: true,
  async load(env) { return loadRig(DIR, DEF, env); },
  init(b, rig) {
    const q = qualityOf(b.world?.game);
    return {
      D: new Drawer(), P: new Particles(q.particles), shards: new Shards(32), q,
      ...flashBuf(b),   // 굽은 띠(꼬리/몸통) 가산 섬광 버퍼 — 싸움 도중에 캔버스를 만들지 않게 미리
      dmg: new DamageState(b.def?.phases ?? [0.6, 0.3]), lt: null, pf: 0, jolt: 0, hflip: null,
      tx: new Float32Array(14), ty: new Float32Array(14), tr: new Float32Array(14),
      debris: rig.man.groups?.debris ?? [], bursts: 0,
    };
  },
  draw(ctx, b, world, rig, st) { drawLeviathan(ctx, b, world, rig, st); },
  bounds(b, rig, st, out) {
    // 수면 파문·거품·꼬리 내려치기·도약 아치까지: 경기장 폭 전체 × 수면 위 (몸이 물속이면 그릴 것도 거의 없다)
    const A = b.A, F = A.floor;
    let x0 = A.x0 - 260, x1 = A.x1 + 260, y0 = F - 760, y1 = F + 60;
    for (let i = 0; i < (b.sx?.length ?? 0); i += 3) { if (b.sy[i] - 160 < y0) y0 = b.sy[i] - 160; }
    if (b.hy - 220 < y0) y0 = b.hy - 220;
    out.x = x0; out.y = y0; out.w = x1 - x0; out.h = y1 - y0;
    return out;
  },
  debris(i, rig) {
    const names = rig.man.groups?.debris; if (!names?.length) return null;
    const p = rig.parts[names[i % names.length]], im = p.v.base, k = p.k * 0.8;
    return { size: Math.max(10, (p.r ?? 10) * 1.1), draw: (ctx) => { ctx.drawImage(im, -p.c[0] * k, -p.c[1] * k, im.width * k, im.height * k); } };
  },
};

const _a = [0, 0], _b = [0, 0], _c = [0, 0], _d = [0, 0];
const _X = new Float32Array(40), _Y = new Float32Array(40), _R = new Float32Array(40), _arc = new Float32Array(40);

function drawLeviathan(ctx, b, world, rig, st) {
  const D = st.D, R = rig.parts;
  if (st.q.name !== tierOf(world.game)) st.q = qualityOf(world.game);
  const q = st.q, P = st.P, t = b.t;
  const now = world.time ?? b.t;
  const dt = st.lt == null ? 1 / 60 : clamp(now - st.lt, 0, 0.05); st.lt = now;
  const A = b.A, F = A.floor;
  P.update(dt, F);
  st.shards.update(dt, F);
  const dying = b.dying > 0, dT = dying ? 3.2 - b.dying : 0;
  const ratio = dying ? 0 : b.hp / b.stats.maxHp;
  const up = st.dmg.update(ratio, dt);
  const lvl = dying ? 2 : Math.max(0, st.dmg.level);
  const tint = (b.phase >= 2 || dying) && lvl >= 2 ? 'rage' : null;
  const bioC = b.phase >= 2 ? BIO2 : BIO, bio = clamp(b.bio ?? 1, 0, 1);
  const hit = b.flashT > 0.06 && !(st.pf > 0.06); st.pf = b.flashT;
  if (hit) st.jolt = 1;
  st.jolt = Math.max(0, st.jolt - dt * 7);
  const flashOn = b.flashT > 0 && !dying;
  // 피격 섬광은 맞은 부위에만: 머리 판정 → 머리·턱, 몸통 마디 판정 → 몸통 띠 (부위를 모르면 전체)
  const hp = flashOn ? b.hitPart : null, headHit = flashOn && (!hp || hp === b.headR), bodyHit = flashOn && (!hp || hp !== b.headR);
  // 섬광 세기. 부품은 그린 직후 바로 덧그린다 (끝에 한꺼번에 덧그리면 머리에 가려지는 턱 윗부분이 머리 위로 비친다)
  st.fa = flashOn ? clamp(b.flashT / 0.1, 0, 1) * 0.5 : 0;
  const bs = b.facing >= 0 ? 1 : -1;
  const V = (part, deep = false) => pickVariant(part, lvl, deep, tint);
  if (up > 0) { P.burst('blood', b.hx, b.hy, 10 + up * 4, { speed: 260, angle: -PI / 2, spread: 1.3 }); P.burst('chip', b.hx, b.hy, 8, { speed: 240, color: '#3d7a78' }); }
  const q0 = ctx.imageSmoothingQuality;
  ctx.imageSmoothingQuality = 'low';
  const ga0 = ctx.globalAlpha;
  if (dying) ctx.globalAlpha = ga0 * clamp(b.dying / 0.45, 0, 1);
  D.begin(ctx);
  // 수면 파문 (로직 그리기: 가산 타원)
  b.paintBack?.(ctx, world);
  P.draw(ctx, 0);
  // ── 수면 위만 (몸이 물에서 솟는다) ──
  D.end(); D.save();
  ctx.beginPath(); ctx.rect(A.x0 - 600, F - 4000, A.w + 1200, 4003); ctx.clip();
  // 마디 (머리 0 → 꼬리 29), 물 아래로 완전히 잠긴 꼬리 쪽은 건너뜀
  const N = b.sx.length;
  let n = N;
  while (n > 2 && b.sy[n - 1] - b.sr[n - 1] > F + 4 && b.sy[n - 2] - b.sr[n - 2] > F + 4) n--;
  for (let i = 0; i < n; i++) { _X[i] = b.sx[i]; _Y[i] = b.sy[i]; _R[i] = b.sr[i]; }
  const vis = n >= 2 && !(b.sub && b.mode !== 'arc' && b.hy - 80 > F);
  const Bd = R.body;
  if (vis && Bd) {
    // 먼 가슴지느러미 (몸 뒤)
    pecFin(D, R.pec, b, 4, bs, t, true, V);
    // 등지느러미 (몸 뒤)
    dorsalFins(D, R, b, n, bs, t, V, dying);
    // 몸통 띠 (꼬리 → 머리)
    D.rec = false;
    drawChain(ctx, D, V(Bd), Bd, _X, _Y, _R, n, bs, 0, 1);
    // 섬광: 띠를 반 해상도 버퍼에 불투명하게 그린 뒤 한 번만 가산 (띠를 바로 가산하면 겹친 곳은 두 번, 굽은 바깥 틈은 0번 더해져
    // 줄무늬·검은 쐐기가 생겼다)
    if (bodyHit && Bd.v.flash) flashLayer(ctx, D, st, chainBox(_X, _Y, _R, n, Bd), clamp(b.flashT / 0.1, 0, 1) * 0.45, (o, D2) => drawChain(o, D2, Bd.v.flash, Bd, _X, _Y, _R, n, bs, 0, 1));
    // 도약 중 꼬리 끝 지느러미
    if (b.mode === 'arc' && R.fluke && _Y[n - 1] < F + 20) {
      const i = n - 1, a = Math.atan2(_Y[i] - _Y[i - 1], _X[i] - _X[i - 1]);
      D.part(R.fluke, V(R.fluke), 'base', _X[i], _Y[i], a + PI / 2 + Math.sin(t * 7) * 0.12, R.fluke.k * 0.5 * bs, R.fluke.k * 0.5, 1);
    }
    // 가까운 가슴지느러미
    pecFin(D, R.pec, b, 4, bs, t, false, V);
    D.end();
    // 생물발광 반점 (마디 3개마다, 흐르는 맥동)
    if (q.halos && bio > 0.02) {
      for (let i = 2; i < n; i += 3) {
        if (_Y[i] > F) continue;
        const pulse = 0.5 + 0.5 * Math.sin(t * 5 - i * 0.55);
        const nx = -Math.sin(b.sa[i]) * bs, ny = Math.cos(b.sa[i]) * bs;
        halo(ctx, _X[i] - nx * _R[i] * 0.15, _Y[i] - ny * _R[i] * 0.15, _R[i] * (0.6 + pulse * 0.5), bioC, 0.28 * bio * (0.4 + pulse * 0.6));
      }
    }
    // 물방울 (도약·솟구침 중 몸에서 떨어짐)
    const wet = b.mode === 'arc' || b.state === 'rise' || b.state === 'bite';
    if (rr.next() < dt * (wet ? 18 : 2) * q.ambient) {
      const i = Math.floor(rr.next() * n);
      if (_Y[i] < F - 10) P.emit('blood', _X[i] + rr.range(-8, 8), _Y[i] + _R[i] * 0.6, rr.range(-20, 20), 0, { color: '#1c4f5e', hi: '#c8f6ff', layer: 1 });
    }
  }
  // ── 꼬리 내려치기 ──
  if (b.tail) drawTailSlam(ctx, D, b, rig, st, bs, t, F, V, flashOn && !hp);
  // ── 머리 ──
  if (vis && b.hy - 90 < F) drawHead(ctx, D, b, rig, st, dt, bs, t, lvl, tint, bioC, bio, headHit, V);
  if (flashOn) D.flash(clamp(b.flashT / 0.1, 0, 1) * 0.5);
  else { D.rec = false; D.log.length = 0; }
  D.end();
  st.shards.draw(D);
  D.end();
  D.restore();   // 수면 클립
  // 수면 거품 · 화면 가장자리 해일 경고 (로직 그리기)
  if (vis) b.paintFoam?.(ctx);
  b.paintWarnEdge?.(ctx, t);
  // 반응 / 사망
  if (hit) {
    const hp = b.hitPart, x = hp ? hp.x + hp.w / 2 : b.hx, y = hp ? hp.y + hp.h / 2 : b.hy;
    P.burst('blood', x, y, 6, { speed: 240, angle: -PI / 2, spread: 1.4 });
    P.burst('chip', x, y, 5, { speed: 220, color: '#2f6b6c' });
  }
  if (dying) deathFx(b, rig, st, dt, dT, bs);
  P.draw(ctx, 1);
  ctx.globalAlpha = ga0;
  ctx.imageSmoothingQuality = q0;
}

/**
 * 곧은 몸통 그림을 점 목록(0 = 머리 쪽)을 따라 띠로 구부려 그린다. 가로 배율은 그림 그대로(늘이지 않음) —
 * 사슬이 그림보다 길면 무늬가 반복된다(주기 = root→tip). 두께는 마디 반지름 R 에 비례. bs = 배 쪽 부호(좌우 반전).
 * 띠마다 setTransform + drawImage 한 번. 꼬리 → 머리 순서로 그려 머리 쪽이 위에 겹친다.
 */
function drawChain(ctx, D, img, part, X, Y, Rr, n, bs, sOff = 0, alpha = 1) {
  if (!img || n < 2 || alpha <= 0.01) return;
  const k = part.k, root = part.root[0], tip = part.tip[0], cy = part.root[1], Pt = root - tip, h = img.height;
  _arc[0] = sOff;
  for (let i = 1; i < n; i++) _arc[i] = _arc[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
  const ga = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = ga * alpha;
  for (let i = n - 2; i >= 0; i--) {
    const len = _arc[i + 1] - _arc[i]; if (len < 0.3) continue;
    const rot = Math.atan2(Y[i] - Y[i + 1], X[i] - X[i + 1]);
    const ky = k * ((Rr[i] + Rr[i + 1]) * 0.5) / RMAX * bs;
    const bend = i > 0 ? Math.abs(angDiff(Math.atan2(Y[i - 1] - Y[i], X[i - 1] - X[i]), rot)) : 0;
    const e = 3 + bend * h * 0.3;
    // 텍셀 u = root − (arc/k mod 주기). 한 마디 안에서 주기가 넘어가면 둘로 나눈다
    let sA = _arc[i], sB = _arc[i + 1];
    while (sB - sA > 0.01) {
      const m = ((sA / k) % Pt + Pt) % Pt;                 // sA 에서의 주기 위치 (텍셀)
      const room = (Pt - m) * k;                           // 이 주기 안에서 남은 길이 (world)
      const sE = Math.min(sB, sA + room);
      const uA = root - m, uE = root - (m + (sE - sA) / k);
      // 텍셀 (uE, cy) 가 월드 점 (sE 지점) 에 오게, 머리 쪽(+u)으로 rot
      const f = (sE - _arc[i]) / len;
      const px = X[i + 1] + (X[i] - X[i + 1]) * (1 - f), py = Y[i + 1] + (Y[i] - Y[i + 1]) * (1 - f);
      D.set(uE, cy, px, py, rot, k, ky);
      const s0 = Math.max(0, uE - e), s1 = Math.min(img.width, uA + e + 1);
      if (s1 > s0) ctx.drawImage(img, s0, 0, s1 - s0, h, s0, 0, s1 - s0, h);
      sA = sE;
    }
  }
  ctx.globalAlpha = ga;
}
/** 사슬 띠가 덮는 월드 사각형 (섬광 버퍼 크기) — 띠 반 높이 = 그림 높이/2 × k × R/RMAX */
const _cb = [0, 0, 0, 0];
function chainBox(X, Y, Rr, n, part) {
  _cb[0] = _cb[1] = 1e9; _cb[2] = _cb[3] = -1e9;
  const hh = (part.v?.base?.height ?? part.h) * part.k / RMAX;   // 띠 전체 높이 (root 줄이 가운데가 아닐 수 있어 넉넉히)
  for (let i = 0; i < n; i++) {
    const r = Rr[i] * hh + 6;
    if (X[i] - r < _cb[0]) _cb[0] = X[i] - r; if (Y[i] - r < _cb[1]) _cb[1] = Y[i] - r;
    if (X[i] + r > _cb[2]) _cb[2] = X[i] + r; if (Y[i] + r > _cb[3]) _cb[3] = Y[i] + r;
  }
  return _cb;
}
/** 섬광 띠 버퍼 (init 에서 한 번): 게임 캔버스의 반 해상도 크기. 문서가 없으면(노드 검사) null → 띠 섬광 생략 */
function flashBuf(b) {
  if (typeof document === 'undefined') return { fbuf: null, fctx: null, fD: null };
  const gc = b.world?.game?.canvas;
  const c = document.createElement('canvas');
  c.width = Math.ceil((gc?.width || 1920) * 0.5) + 2; c.height = Math.ceil((gc?.height || 1080) * 0.5) + 2;
  return { fbuf: c, fctx: c.getContext('2d'), fD: new Drawer() };
}
/**
 * 겹쳐 그리는 띠(구부린 몸통)의 가산 섬광: 반 해상도 버퍼에 흰 실루엣을 보통 합성으로 그려(겹쳐도 한 번) 장치 좌표로 한 번만 가산한다.
 * bb = 월드 사각형 [x0,y0,x1,y1]. draw(o, D2) 는 기준 변환(카메라·DPR, 반 해상도)이 걸린 버퍼에 그린다.
 * 버퍼는 init 에서 한 번 만든다(flashBuf, 화면 ¼ 크기) — 싸움 도중에는 캔버스를 새로 만들지 않는다 (MASTER_PLAN §5.2).
 * 화면이 커져 버퍼가 모자라면 해상도(R)를 낮춰 맞춘다.
 */
function flashLayer(ctx, D, st, bb, alpha, draw) {
  const c = st.fbuf;
  if (alpha <= 0.01 || !c) return;
  const m = D.m, cw = ctx.canvas?.width ?? 0, ch = ctx.canvas?.height ?? 0;
  // 장치 좌표 사각형: 네 모서리를 전체 변환으로 옮겨 감싼다 (카메라 흔들림·기울기 회전이 있으면 대각 성분만으로는 띠 끝이 잘린다)
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
  for (let j = 0; j < 4; j++) {
    const x = j & 1 ? bb[2] : bb[0], y = j & 2 ? bb[3] : bb[1];
    const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
    if (X < ax) ax = X; if (X > bx) bx = X; if (Y < ay) ay = Y; if (Y > by) by = Y;
  }
  const dx0 = Math.max(0, Math.floor(ax)), dy0 = Math.max(0, Math.floor(ay));
  const dx1 = Math.min(cw, Math.ceil(bx)), dy1 = Math.min(ch, Math.ceil(by));
  if (dx1 - dx0 < 2 || dy1 - dy0 < 2) return;
  const R = Math.min(0.5, (c.width - 1) / (dx1 - dx0), (c.height - 1) / (dy1 - dy0));
  const w = Math.ceil((dx1 - dx0) * R), h = Math.ceil((dy1 - dy0) * R);
  const o = st.fctx;
  o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, w + 1, h + 1);
  o.setTransform(m[0] * R, m[1] * R, m[2] * R, m[3] * R, (m[4] - dx0) * R, (m[5] - dy0) * R);
  const D2 = st.fD;
  D2.begin(o);
  draw(o, D2);
  const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * alpha;
  ctx.drawImage(c, 0, 0, w, h, dx0, dy0, dx1 - dx0, dy1 - dy0);
  ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  D.end();
}
function angDiff(a, b) { const d = a - b; return Math.atan2(Math.sin(d), Math.cos(d)); }

/** 등지느러미: 마디 5·10·15·20 의 등 쪽에서 꼬리 방향으로 젖혀져 흔들림 */
function dorsalFins(D, R, b, n, bs, t, V, dying) {
  const F = b.A.floor;
  for (let j = 0; j < 4; j++) {
    const i = 5 + j * 5; if (i >= n - 1) break;
    const fin = R['fin' + j]; if (!fin) continue;
    const y = b.sy[i]; if (y > F + 10) continue;
    const sa = b.sa[i], r = b.sr[i];
    const bx = Math.sin(sa) * bs, by = -Math.cos(sa) * bs;                 // 등 방향
    const tx = -Math.cos(sa), ty = -Math.sin(sa);                           // 꼬리 방향
    const sw = 0.55 + Math.sin(t * 3 + i) * 0.12 + (dying ? 0.4 : 0);
    const dx = bx + tx * sw, dy = by + ty * sw;
    const rot = Math.atan2(dy, dx) + PI / 2;
    const sgn = (Math.cos(rot) * tx + Math.sin(rot) * ty) > 0 ? 1 : -1;
    const k = fin.k * 0.55 * (r / 40);
    D.part(fin, V(fin), 'base', b.sx[i] + bx * r * 0.45, y + by * r * 0.45, rot, k * sgn, k, 1);
  }
}
/** 가슴지느러미 (마디 i 의 배 쪽, 꼬리 방향으로 펄럭임). far = 먼 쪽(어둡게, 몸 뒤) */
function pecFin(D, pec, b, i, bs, t, far, V) {
  if (!pec || b.sy[i] > b.A.floor + 10) return;
  const sa = b.sa[i], r = b.sr[i];
  const nx = -Math.sin(sa) * bs, ny = Math.cos(sa) * bs;       // 배 방향
  const tx = -Math.cos(sa), ty = -Math.sin(sa);
  const fl = Math.sin(t * 4.2 + (far ? 1.3 : 0)) * 0.22;
  const w = far ? 0.35 : 0.6;
  let dx = tx * 0.8 + nx * w, dy = ty * 0.8 + ny * w;
  const ang = Math.atan2(dy, dx) + fl * bs;
  const vx = pec.tip[0] - pec.root[0], vy = (pec.tip[1] - pec.root[1]) * -bs;
  const rot = ang - Math.atan2(vy, vx);
  const k = pec.k * (far ? 0.78 : 0.95);
  D.part(pec, V(pec, far), 'root', b.sx[i] + nx * r * 0.45, b.sy[i] + ny * r * 0.45, rot, k, -k * bs, 1);
}

// ───────────────────────── 머리 ─────────────────────────
function drawHead(ctx, D, b, rig, st, dt, bs, t, lvl, tint, bioC, bio, flashOn, V) {
  const R = rig.parts, H = R.head, J = R.jaw; if (!H || !J) return;
  const q = st.q, P = st.P;
  const ca = Math.cos(b.ha);
  if (st.hflip == null) st.hflip = ca < 0 ? -1 : 1;
  else if (ca < -0.2) st.hflip = -1; else if (ca > 0.2) st.hflip = 1;
  const fl = st.hflip;
  const jo = st.jolt;
  const hx = b.hx + (jo ? (rr.next() - 0.5) * 6 * jo : 0), hy = b.hy + (jo ? (rr.next() - 0.5) * 6 * jo : 0);
  const k = H.k * 1.02, sx = k, sy = k * fl;
  const a0 = Math.atan2((H.snout[1] - H.o[1]) * fl, H.snout[0] - H.o[0]);
  const rot = b.ha - a0 + (jo ? (rr.next() - 0.5) * 0.06 * jo : 0);
  const jaw = clamp(b.jaw ?? 0, 0, 1.1);
  const ja = (Math.min(1, jaw) - 1) * 0.55;
  // 목구멍 (뚫린 입 속): 어두운 살 + 수압포 충전 빛.
  // 다각형은 크게 벌린 입 기준이라, 경첩→입 선 아래(아래턱 쪽) 꼭짓점은 턱과 같이 경첩을 축으로 회전시킨다
  // (텍셀 공간에서 턱 회전 = ja). 그대로 두면 턱을 다물 때 아래턱 밑으로 검은 삼각형이 삐져나왔다.
  D.set(H.o[0], H.o[1], hx, hy, rot, sx, sy);
  const TH = H.throat, gx = H.hinge[0], gy = H.hinge[1], ux = H.mouth[0] - gx, uy = H.mouth[1] - gy;
  const cj = Math.cos(ja), sj = Math.sin(ja);
  ctx.beginPath();
  for (let i = 0; i < TH.length; i++) {
    let x = TH[i][0], y = TH[i][1];
    const dx = x - gx, dy = y - gy;
    if (ux * dy - uy * dx > 0) { x = gx + dx * cj - dy * sj; y = gy + dx * sj + dy * cj; }
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#0b0206'; ctx.fill();
  D.end();
  const mg = clamp(b.mouthGlow ?? 0, 0, 1);
  const m = D.pt(H.o[0], H.o[1], H.mouth[0], H.mouth[1], hx, hy, rot, sx, sy, _a);
  if (q.halos && jaw > 0.3) { const th = D.pt(H.o[0], H.o[1], TH[1][0], TH[1][1], hx, hy, rot, sx, sy, _c); halo(ctx, (th[0] + m[0]) / 2, (th[1] + m[1]) / 2, 24 + jaw * 12, '#5a0c24', 0.45 * jaw); }
  const hinge = D.pt(H.o[0], H.o[1], H.hinge[0], H.hinge[1], hx, hy, rot, sx, sy, _b);
  D.rec = flashOn;
  D.part(J, V(J), 'hinge', hinge[0], hinge[1], rot + fl * ja, sx, sy, 1);
  if (flashOn) D.flash(st.fa);   // 턱 섬광은 머리 앞에 비치지 않게 머리를 그리기 전에
  D.rec = flashOn;
  D.part(H, V(H), 'o', hx, hy, rot, sx, sy, 1);
  if (flashOn) D.flash(st.fa);
  D.rec = false;
  glowOver(ctx, D, H, lvl, 'o', hx, hy, rot, sx, sy, 0.55, st, t, tint);
  const e = D.pt(H.o[0], H.o[1], H.eye[0], H.eye[1], hx, hy, rot, sx, sy, _c);
  const cr = D.pt(H.o[0], H.o[1], H.crown[0], H.crown[1], hx, hy, rot, sx, sy, _d);
  D.end();
  if (q.halos) {
    halo(ctx, e[0], e[1], 16 + (b.phase >= 2 ? 6 : 0), bioC, 0.75 * bio, true);
    halo(ctx, cr[0], cr[1], 60, bioC, 0.16 * bio * (0.7 + 0.3 * Math.sin(t * 3)));
  }
  // 수압포 충전: 입 속 물빛
  if (mg > 0.02) {
    halo(ctx, m[0], m[1], 30 + 50 * mg, WATER, mg);
    halo(ctx, m[0], m[1], 14 + 10 * mg, '#ffffff', mg * 0.9, true);
  }
  // 턱에서 흘러내리는 검은 물
  const tip = D.pt(H.hinge[0], H.hinge[1], J.drip[0], J.drip[1], hinge[0], hinge[1], rot + fl * ja, sx, sy, _d);
  if (!b.sub && rr.next() < dt * (1.5 + jaw * 5) * q.ambient) P.emit('blood', tip[0], tip[1], 0, 0, { color: '#16323a', hi: '#9fe8ff', hang: rr.range(0.1, 0.35), layer: 1 });
}

// ───────────────────────── 꼬리 내려치기 ─────────────────────────
function drawTailSlam(ctx, D, b, rig, st, bs, t, F, V, flashOn) {
  const tl = b.tail, R = rig.parts, Bd = R.body;
  if (tl.warn) { D.end(); warnRect(ctx, (b.tailX ?? tl.x) - 100, F - 170, 200, 170, tl.k, '#5fe8ff', t); }
  if (!Bd) return;
  const TN = 12, fc = b.facing >= 0 ? 1 : -1;
  const bx = tl.x - fc * 90, by = F + 80, cx = (bx + tl.x) / 2 - fc * 60, cy = F - 40;
  for (let i = 0; i < TN; i++) {
    const u = i / (TN - 1), v = 1 - u;
    st.tx[i] = v * v * tl.x + 2 * v * u * cx + u * u * bx + Math.sin(t * 6 + i) * 3 * u;
    st.ty[i] = v * v * tl.y + 2 * v * u * cy + u * u * by;
    st.tr[i] = 13 + 22 * u;
  }
  const tbs = -bs;
  drawChain(ctx, D, V(Bd), Bd, st.tx, st.ty, st.tr, TN, tbs, 250, 1);
  if (flashOn && Bd.v.flash) flashLayer(ctx, D, st, chainBox(st.tx, st.ty, st.tr, TN, Bd), clamp(b.flashT / 0.1, 0, 1) * 0.45, (o, D2) => drawChain(o, D2, Bd.v.flash, Bd, st.tx, st.ty, st.tr, TN, tbs, 250, 1));
  const Fl = R.fluke; if (!Fl) return;
  const a = Math.atan2(st.ty[0] - st.ty[1], st.tx[0] - st.tx[1]);
  D.rec = flashOn;
  D.part(Fl, V(Fl), 'base', st.tx[0], st.ty[0], a + PI / 2, Fl.k * 0.85 * fc, Fl.k * 0.85, 1);
  if (flashOn) D.flash(st.fa);
  D.rec = false;
  D.end();
  if (st.q.halos) halo(ctx, st.tx[0] + Math.cos(a) * 40, st.ty[0] + Math.sin(a) * 40, 70, b.phase >= 2 ? BIO2 : BIO, 0.25);
}

/** 손상 단계 균열 발광 (반 해상도, 가산, 맥동) */
function glowOver(ctx, D, part, lvl, pivot, x, y, rot, sx, sy, a, st, t, tint) {
  if (!st.q.crackGlow || lvl <= 0) return;
  const drawn = lvl >= 2 ? 2 : (part.v.dmg1 || part.v.deep_dmg1) ? 1 : 0;
  if (!drawn) return;
  const g = drawn === 2 ? ((tint && part.gl[tint + '_dmg2']) || part.gl.dmg2) : part.gl.dmg1;
  if (!g) return;
  const pv = typeof pivot === 'string' ? part[pivot] : pivot;
  const pa = a * (0.55 + 0.45 * Math.sin(t * 4.2 + part.w * 0.01)) * (lvl > 1 ? 1.15 : 0.8);
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  D.img(g, (pv[0] - part.pad) * 0.5, (pv[1] - part.pad) * 0.5, x, y, rot, sx * 2, sy * 2, Math.min(1, pa));
  ctx.globalCompositeOperation = op;
}

// ───────────────────────── 사망 ─────────────────────────
// 로직: 머리가 수면 위에서 몸부림(1.3 s) → 물속으로 가라앉음, bio 가 꺼짐. 채색: 피 분출 · 비늘/뼈 파편이 떨어져 나감 · 끝에 페이드
function deathFx(b, rig, st, dt, dT, bs) {
  const P = st.P, R = rig.parts, sh = st.shards;
  const at = [0.1, 0.55, 1.05];
  while (st.bursts < at.length && dT >= at[st.bursts]) {
    const j = st.bursts++;
    P.burst('blood', b.hx, b.hy, 16, { speed: 320, angle: -PI / 2, spread: 1.5 });
    const i = Math.min(b.sx.length - 1, 4 + j * 5);
    if (b.sy[i] < b.A.floor) {
      for (let m = 0; m < 3 && st.debris.length; m++) {
        const p = R[st.debris[(j * 3 + m) % st.debris.length]], a = -PI / 2 + (rr.next() - 0.5) * 2.2, sp = rr.range(220, 460);
        sh.spawn(p.v.base, p.c[0], p.c[1], b.sx[i], b.sy[i], rr.next() * TAU, p.k * rr.sign(), p.k, Math.cos(a) * sp, Math.sin(a) * sp, rr.range(-8, 8), { r: (p.r ?? 10) * 0.6, fade: Math.max(0.3, 3.1 - dT) });
      }
      P.burst('blood', b.sx[i], b.sy[i], 10, { speed: 260 });
    }
  }
  if (dT < 1.4 && rr.next() < dt * 14) P.emit('blood', b.hx + rr.range(-30, 30), b.hy + rr.range(-10, 20), rr.range(-120, 120), rr.range(-260, -80), { layer: 1 });
}
