// v2 play — 움직임: 놀이 상태(sim.js 의 영웅 · 적) → 보는 방향 + 클립. docs/v2/PLAY_API.md §0 · docs/v2/ANIM_LIBRARY.md §4
// 규칙이 방향(dirX,dirZ)과 시간(moveT · animT · gait …)을 정하고, 여기서는 그것을 그림으로 옮기기만 한다:
//   · 방향은 부드럽게 따라 돈다. 스틱을 반대로 꺾어도 도는 쪽이 오락가락하지 않게 한번 정한 쪽으로 끝까지 돈다
//   · 달리기 · 걷기 클립의 시각은 규칙의 걸음 주기(gait)에서 온다 → 발 디딤과 땅 위 속도가 맞는다(발이 미끄러지지 않는다)
//   · 공격 클립은 "칼이 빠르게 지나가는 구간(strike)"이 규칙의 판정 구간(hit)과 겹치게 시간을 접는다
//   · 클립은 공용 라이브러리(assets/v2/char3d/clips/)를 처음 불릴 때 스스로 받아 붙인다. 받기 전에는 시범판의 클립으로 돈다
import { Rig, clipFromAnim } from '../char3d/skel.js';
import { driveHero as driveHeroProto } from '../char3d/hero3d.js';
import { loadAnimLib } from './animlib.js';
import { TUNE } from './tune.js';
import { KINDS } from './enemies.js';

const GROUPS = ['locomotion', 'combat', 'reactions', 'magic', 'enemy'];
const LIB = { clips: null, promise: null, failed: false };
const LEGS = ['uplegL', 'uplegR', 'legL', 'legR', 'footL', 'footR', 'toeL', 'toeR'];
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const indexUrlOf = (asset) => String(asset?.url ?? 'assets/v2/char3d/kael.glb').replace(/[^/]*$/, 'clips/index.json');
/** 이미 받아 둔 클립 묶음을 쓴다 (node 검사 · 장면이 먼저 받았을 때) */
export function usePlayClips(clips) { LIB.clips = clips; }
export function playClipsReady() { return !!LIB.clips; }
/** 라이브러리를 받아(한 번만) asset.clips 에 붙인다. asset = loadCharAsset 결과, 또는 index.json 주소 */
export async function loadPlayClips(assetOrUrl) {
  if (!LIB.clips) {
    const url = typeof assetOrUrl === 'string' ? assetOrUrl : indexUrlOf(assetOrUrl);
    LIB.promise ??= loadAnimLib(url, { groups: GROUPS }).then((l) => { LIB.clips = l.clips; return l.clips; }, (e) => { LIB.failed = true; console.warn('[play] clip library not loaded:', e?.message ?? e); return null; });
    await LIB.promise;
  }
  if (assetOrUrl && typeof assetOrUrl === 'object') attach(assetOrUrl, true);
  return LIB.clips;
}
/** 캐릭터 자료에 클립을 붙인다: 모델에 든 클립은 제 이름으로(float_idle · fly …), 라이브러리는 그 위에. 붙었으면 true */
function attach(asset, useLib) {
  if (asset._play) return true;
  if (!asset._playOwn) {
    asset._playOwn = true;
    const rig = new Rig(asset.model);
    for (const a of asset.model.anims ?? []) {
      const k = String(a.name).replace(/[^A-Za-z0-9_]/g, '_');
      if (!asset.clips[k]) { const loop = /idle|walk|run|fly|float|flap/i.test(k); asset.clips[k] = clipFromAnim(rig, a, { name: k, loop, inPlace: loop, rootRel: !loop }); }
    }
  }
  if (!useLib || (asset.clips.roll?.meta && asset.clips.atk3 && asset.clips.idle_combat)) { asset._play = true; return true; }   // 장면이 이미 라이브러리를 붙여 두었으면 그대로 쓴다 (다시 받지 않는다)
  if (!LIB.clips) {
    if (!LIB.promise && !LIB.failed && typeof fetch === 'function' && typeof location !== 'undefined') loadPlayClips(indexUrlOf(asset));
    return false;
  }
  Object.assign(asset.clips, LIB.clips);
  asset._play = true;
  return true;
}

/** 방향을 (tx,tz) 쪽으로 돌린다. k = 따라가는 빠르기(1/초), cap = 가장 빠른 회전(rad/초) */
function turn(ch, S, tx, tz, dt, k, cap) {
  const cur = Math.atan2(ch.dz, ch.dx); let d = wrapPi(Math.atan2(tz, tx) - cur);
  if (Math.abs(d) > 2.2 && S.turnDir && Math.sign(d) !== S.turnDir) d -= Math.sign(d) * Math.PI * 2;   // 거의 반대쪽: 이미 돌던 쪽으로 계속 돈다
  if (Math.abs(d) > 0.3) S.turnDir = Math.sign(d); else if (Math.abs(d) < 0.04) S.turnDir = 0;
  const a = cur + clamp(d * (1 - Math.exp(-dt * k)), -cap * dt, cap * dt);
  ch.dx = Math.cos(a); ch.dz = Math.sin(a);
}
/** 순환 걸음 클립에서 오른발이 닿는 시각(주기 비율): 규칙의 gait 0 = 오른발 */
function footOff(clip) {
  if (clip._offR != null) return clip._offR;
  const ev = clip.events?.find((e) => e[1] === 'footR');
  return (clip._offR = ev ? ev[0] / clip.duration : 0);
}
/** 영웅 기술: 규칙 시간 t → 클립 시각. 클립의 strike 구간이 판정 구간 [h0,h1] 과 겹친다 */
export function warpMove(clip, t, mv) {
  const S = mv.strike ?? clip.meta?.strike; if (!S) return (t / mv.dur) * clip.duration;
  const h0 = mv.hit[0], h1 = mv.hit[1], lead = mv.lead ?? 0.2, tail = mv.tail ?? 0.35;
  if (t < h0) return Math.max(0, S[0] - lead * (1 - t / h0));
  if (t < h1) return S[0] + (S[1] - S[0]) * ((t - h0) / (h1 - h0));
  return Math.min(clip.duration - 0.01, S[1] + tail * ((t - h1) / Math.max(0.01, mv.dur - h1)));
}
/** 적 공격: 예고(windup) 동안 준비 동작을 천천히 올려 붙들고, 판정(strike) 동안 strike 구간을, 그 뒤는 마무리 */
export function warpAttack(clip, t, a) {
  const dur = clip.duration; let s0, s1;
  if (clip.meta?.strike) { s0 = clip.meta.strike[0]; s1 = clip.meta.strike[1]; }
  else { const r = clip.events?.find((e) => e[1] === 'release'); if (r) { s0 = r[0]; s1 = Math.min(dur, r[0] + 0.16); } else { s0 = dur * 0.4; s1 = dur * 0.62; } }
  const w = a.windup, st = a.strike;
  if (t < w) { const u = 1 - t / w, lead = Math.min(s0, w * 1.5); return s0 - lead * u * u; }
  if (t < w + st) return s0 + (s1 - s0) * ((t - w) / st);
  return Math.min(dur - 0.01, s1 + (t - w - st) * 1.1);
}
function pinLegs(rig) {   // 떠다니는 적: 다리 뼈를 쉬는 자세로 묶는다 (옷자락이 찢어지지 않게 — CAST_R1_ENEMIES §4)
  for (const b of LEGS) { const j = rig.key.get(b); if (j != null) for (let c = 0; c < 4; c++) rig.R[j * 4 + c] = rig.restR[j * 4 + c]; }
  rig.pose();
}
const pick = (C, ...names) => { for (const n of names) if (n && C[n]) return n; return null; };

/**
 * 영웅 상태(sim.hero) → 방향 · 클립. ch = Char3D. 장면은 이 뒤에 ch.place(h.x, h.y, h.z) 로 놓고 그리면 된다.
 * 라이브러리 클립이 아직 없으면 시범판의 몰이(char3d/hero3d.js)로 돈다.
 */
export function driveHero(ch, h, dt, T = TUNE) {
  const C = ch.asset.clips;
  if (!attach(ch.asset, true) || !C.roll || !C.atk3) return driveHeroProto(ch, h, dt, T);
  const S = (ch._pm ??= { turnDir: 0, landC: null, wasDead: false, prev: '' }), A = ch.anim, st = h.anim;
  // ── 방향 ──
  if (h.dead || st === 'hurt') { /* 그대로 둔다: 맞고 밀리는 쪽으로 돌지 않는다 */ }
  else if (st === 'attack' || st === 'parry' || st === 'block') turn(ch, S, h.dirX, h.dirZ, dt, 42, 40);
  else if (st === 'roll') turn(ch, S, h.roll?.dx ?? h.dirX, h.roll?.dz ?? h.dirZ, dt, 34, 32);
  else if (st === 'guard') turn(ch, S, h.dirX, h.dirZ, dt, 22, 18);
  else turn(ch, S, h.dirX, h.dirZ, dt, h.onGround ? 17 : 11, 15);
  // ── 클립 ──
  if (S.wasDead && !h.dead) A.play('idle', { fade: 0, restart: true });   // 다시 시작: 누운 자세에서 섞이지 않고 바로 선다
  S.wasDead = !!h.dead;
  if (st === 'land' && S.prev !== 'land') S.landC = 0;
  if (S.landC != null) { S.landC += dt; if ((st !== 'land' && st !== 'idle') || S.landC > 0.44) S.landC = null; }
  S.prev = st;
  if (h.dead) A.play(pick(C, 'knockdown', 'death'), { fade: 0.08, time: Math.min((h.deadT ?? h.animT) * 1.3, 2.45) });
  else if (st === 'hurt') A.play(h.heavyHurt && C.hit_heavy ? 'hit_heavy' : 'hit_light', { fade: 0.04, time: 0.02 + h.animT * 1.3 });
  else if (st === 'parry') A.play('parry', { fade: 0.03, time: 0.28 + (T.parryT - h.parryOk) * 1.5 });
  else if (st === 'block') A.play('block_hit', { fade: 0.03, time: 0.03 + (T.blockT - h.blockT) * 1.3 });
  else if (st === 'guard') A.play('block', { fade: 0.08 });
  else if (st === 'attack' && h.move) {
    const mv = h.move, clip = C[mv.clip] ?? C.atk1;
    if (mv.kind === 'plunge') A.play(clip.name, { fade: 0.05, time: h.plungeLand == null ? Math.min(0.25, 0.05 + h.moveT * 0.9) : 0.27 + (h.moveT - h.plungeLand) * 1.3 });
    else A.play(clip.name, { fade: 0.05, time: warpMove(clip, h.moveT, mv) });
  }
  else if (st === 'roll') { const u = h.roll ? clamp(h.roll.t / h.roll.dur, 0, 1) : 0; A.play('roll', { fade: 0.05, time: 0.13 + u * 0.89 }); }
  else if (st === 'jump') A.play('jump', { fade: 0.05, time: 0.1 + h.animT });
  else if (st === 'fall') A.play('air', { fade: 0.14 });
  else if (S.landC != null) A.play('land', { fade: 0.04, time: 0.04 + S.landC * 1.3 });
  else if (st === 'run' || st === 'walk') { const c = C[st]; A.play(st, { fade: 0.14, time: ((h.gait + footOff(c)) % 1) * c.duration }); }
  else A.play(h.lock != null && C.idle_combat ? 'idle_combat' : 'idle', { fade: 0.2 });
  A.update(dt);
}

/**
 * 적 · 인물 상태 → 방향 · 클립. e 가 sim 의 적(e.def 또는 KINDS 에 있는 e.kind)이면 종류표의 클립 이름을 쓴다.
 * 그 밖의 것(말하는 인물 등)은 e.dirX/dirZ 를 보고, e.clip 또는 e.anim 과 같은 이름의 클립을 튼다(없으면 idle).
 */
export function driveActor(ch, e, dt) {
  const D = e.def ?? (e.kind != null ? KINDS[e.kind] : null);
  const S = (ch._pm ??= { turnDir: 0, init: false }), C = ch.asset.clips, A = ch.anim;
  if (!D) {
    attach(ch.asset, true);
    turn(ch, S, e.dirX ?? e.facing ?? 1, e.dirZ ?? 0, dt, 12, 14);
    const want = e.state === 'dead' ? pick(C, 'death_back', 'death') : pick(C, e.clip, e.anim);
    A.play(want ?? pick(C, 'idle') ?? Object.keys(C)[0], { fade: 0.15 });
    A.update(dt); return;
  }
  attach(ch.asset, D.lib !== false);
  const K = D.clips, atk = e.state === 'attack' && e.atk;
  if (e.state !== 'dead' && !e.dead) turn(ch, S, e.dirX, e.dirZ, dt, atk ? 24 : 13, 22);
  let name = null, o = { fade: 0.14 };
  if (e.state === 'dead' || e.dead) { name = pick(C, K.death, 'death'); if (name && !C[name].loop) o = { fade: 0.08, time: Math.min(Math.max(0, D.dieT - e.dying) * 1.25 + 0.02, C[name].duration - 0.02) }; }
  else if (e.state === 'stagger') { name = pick(C, e.staggerSide < 0 ? K.stagger + '_r' : null, K.stagger, K.hurt); if (name && !C[name].loop) o = { fade: 0.06, time: Math.min(0.02 + e.animT * 1.15, C[name].duration - 0.02) }; }
  else if (e.anim === 'hurt') { name = pick(C, K.hurt); if (name && !C[name].loop) o = { fade: 0.04, time: 0.02 + e.animT * 1.3 }; }
  else if (atk) { name = pick(C, atk.clip); if (name) o = C[name].loop ? { fade: 0.08, speed: e.phase === 'strike' ? 1.7 : 1.2 } : { fade: 0.07, time: warpAttack(C[name], e.stateT, atk) }; }
  else if (e.anim === 'walk') { name = pick(C, K.walk); if (name && D.stride && !D.floats && !D.fly) o = { fade: 0.16, time: ((e.gait + footOff(C[name])) % 1) * C[name].duration }; }
  if (!name) name = pick(C, K.idle, 'idle', 'run') ?? Object.keys(C)[0];
  A.play(name, o);
  if (!S.init) { S.init = true; if (!A.ext) A.t = (e.id * 0.37) % (C[name].duration || 1); }   // 떼로 나올 때 같은 박자로 움직이지 않게
  A.update(dt);
  if (D.floats) pinLegs(ch.rig);
}

/**
 * 놓기: ch.M 을 채워 돌려준다. 박쥐처럼 숙여 나는 것(KINDS.pitch 도)은 앞으로 숙인 행렬을 만든다. 그 밖에는 ch.place 와 같다.
 *   장면: const M = placeActor(ch, e); ch.draw(M, { alpha: e.alpha, … })
 */
export function placeActor(ch, e, s = ch.scale) {
  const D = e.def ?? KINDS[e.kind], p = ((D?.pitch ?? 0) * Math.PI) / 180;
  if (!p) return ch.place(e.x, e.y, e.z);
  const M = ch.M, dx = ch.dx, dz = ch.dz, c = Math.cos(p), sn = Math.sin(p);
  M[0] = -dz * s; M[1] = 0; M[2] = dx * s; M[3] = 0;
  M[4] = sn * dx * s; M[5] = c * s; M[6] = sn * dz * s; M[7] = 0;
  M[8] = c * dx * s; M[9] = -sn * s; M[10] = c * dz * s; M[11] = 0;
  M[12] = e.x; M[13] = e.y; M[14] = e.z; M[15] = 1;
  return M;
}
