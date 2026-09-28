// 캐릭터 렌더러 — 플레이어블 6인 · 직업 42종 · 장비 외형 · NPC 공용
// 영웅은 채색 컷아웃 퍼펫(hero_puppet.js, 에셋이 있는 캐릭터/직업)으로, 나머지·로딩 중·NPC 는 절차적 벡터 인형으로 그린다.
// drawHero(ctx, p, world, opts)
//   p: {cx, bottom, facing, anim, animT, move, moveT, atkSpeedMul, look, ch, vx, vy, onGround, rig, t, stats, charging, muzzleT, dashT,
//       gaitPh?(WP1 보행 위상), feel?(WP1 찌그러짐 등), ride?(탈것 C6), hero?{classId}}
//   opts: {alpha, tint(단색 잔상), scale(UI 확대; 생략 시 게임 속 플레이어는 HERO_DRAW_SCALE), noFx(효과 생략), rim,
//          yaw?(턴테이블 각도, 라디안 — 정의되면 facing 무시: 0 오른쪽 옆, +π/2 정면, π 왼쪽 옆, −π/2 뒤)}
// 걸음(WP1, feel.md 3.3.3): walk/sprint/run_start/skid/pivot/land_heavy → hero_gait.js gaitPose + GAIT_ANIMS, 풀이 전 applyFeelOverlay
// 탈것(C6, companions.md §11.4): p.ride 가 있으면 앉은 자세·안장 원점·먼 다리 생략 (riderPose)
// 외부 훅(heroHooks): gait / gaitAnims / blend / feel / rider — 등록하면 위 기본 동작을 덮어쓴다 (docs/art/PUPPET_PIPELINE.md §6)
// 흐름: look → spec(치수·색, look 객체별 캐시) → 애니메이션 자세(pose) → 2관절 IK 골격
//       → 베를레 체인(망토·머리카락·스카프·베일, p.rig 에 저장) → 레이어 순서대로 그리기
// 좌표: 발 중앙(cx,bottom) 원점, 오른쪽을 보는 기준, y 위쪽 음수. facing(±1)으로 좌우 반전.
import { VerletChain } from '../core/physics.js';
import { TAU, clamp, lerp, ease } from '../core/math.js';
import {
  G, sh, mx, ra, F, capsule, grad, outline, ellipse, glow, ribbonPath, smoothClosed, WS, h01, group, fl,
  EL_COL, weaponReach, drawWeapon, drawLash, drawWhipCoil, drawWing, drawAuraMotes, drawMagicCircle, drawHalo, olc,
} from './hero_parts.js';
import * as PUP from './hero_puppet.js';
import * as GAIT from './hero_gait.js'; // feel.md 3.3.3 (WP1) — hero_gait.js 는 hero.js 를 import 하면 안 된다 (순환 → TDZ)

const PI = Math.PI, HP = PI / 2;

// ───────────────────────── 외형 해석(spec) ─────────────────────────
const BUILD = { slim: 0.88, normal: 1, broad: 1.14, huge: 1.3 };
const FEM = new Set(['nun', 'ninja', 'girl', 'lady', 'innkeeper']);
const COAT_DEF = { hunter: 'long', nun: 'robe', gunslinger: 'long', knight: 'short', ninja: 'none', noble: 'long', villager: 'short', priest: 'robe', merchant: 'long', smith: 'none', innkeeper: 'dress', girl: 'dress', lady: 'dress' };
const BLADE_DEF = {
  sword: ['#c8ccd8', '#d8dce8', '#e0e4ec', '#5a6078', '#f4ecd0', '#a8142a'],
  greatsword: ['#9a9aa2', '#b8bcc8', '#d0d4dc', '#c87a4a', '#f0e8c8', '#2a1a24'],
  dagger: ['#c8ccd8', '#d8dce8', '#b8bcc8', '#34343e', '#e8d8a8', '#c0142a'],
  whip: ['#6a4424', '#5a3418', '#8a8e9a', '#b8bcc8', '#e8c872', '#8a0a1e'],
  gun: ['#5a5058', '#6a6a74', '#7a7a88', '#4a4a54', '#c8ccd8', '#d8b040'],
  staff: ['#7a5a3a', '#6a4a2a', '#8a8ea8', '#c8ccd4', '#f0e8d0', '#2a1a3a'],
};
const DEF_LOOK = { build: 'normal', skin: '#e8c2a0', hair: '#5a3a2a', hairStyle: 'short', outfit: 'villager', coat: 'short', primary: '#5a4a3a', secondary: '#3a2a1a', trim: '#8a7a5a', pants: '#3a3028', boots: '#2a1a10' };
const col = (c, d) => (typeof c === 'string' && c ? c : d);

function weaponSpec(w, p) {
  w = w || {};
  const type = w.type || p?.ch?.weaponType || 'none';
  const style = clamp(Math.round(w.style || 1), 1, 6);
  const lv = w.level || 0, rar = w.rarity || 0, el = w.element || null;
  let glowLv = lv >= 13 ? 3 : lv >= 10 ? 2 : lv >= 7 ? 1 : 0;
  if ((rar >= 4 || w.glow) && glowLv < 1) glowLv = 1;
  return {
    type, style, level: lv, rarity: rar, element: el, glowLv,
    glowC: el ? EL_COL[el] : typeof w.glow === 'string' ? w.glow : rar >= 2 ? ['#d8d0c0', '#6fe07a', '#5aa8ff', '#c07cff', '#ffa640', '#ff4a5a'][rar] : w.glow ? '#ffd070' : null,
    blade: col(w.color, BLADE_DEF[type]?.[style - 1] || '#c8ccd8'),
    hilt: style >= 3 ? (style === 4 ? '#4a4450' : style === 6 ? '#2a1a1e' : '#c8a040') : '#6a6470',
    grip: style === 5 ? '#e8e0d0' : style === 6 ? '#3a0a12' : '#3a2418',
    gem: el ? EL_COL[el] : style === 6 ? '#ff2a44' : style === 5 ? '#8ac8ff' : '#e0304a',
  };
}

function buildSpec(L, p) {
  const o = L.outfit || 'villager';
  const cid = p?.ch?.id || null;
  const fem = L.fem ?? (cid ? cid === 'sera' || cid === 'lia' : FEM.has(o));
  const kid = o === 'girl' || L.kid === true;
  const B = BUILD[L.build] ?? 1;
  const pr = col(L.primary, '#4a3a30'), se = col(L.secondary, sh(pr, -0.3)), tr = col(L.trim, '#b8a070');
  const armor = L.armor || null;
  const ac = col(L.armorColor, armor === 'holy' ? '#dfe3ee' : armor === 'dark' ? '#34303a' : armor === 'leather' ? '#5a3a24' : '#8a8e9a');
  const at = col(L.armorTrim, armor === 'holy' ? '#e8c872' : armor === 'dark' ? '#b01830' : armor === 'leather' ? '#b89a60' : sh(ac, 0.35));
  const heavy = armor === 'plate' || armor === 'holy' || armor === 'dark';
  const skin = col(L.skin, '#e8c2a0');
  const K = {
    L, o, fem, kid, B, cid, coat: L.coat || COAT_DEF[o] || 'short',
    hW: (fem ? 0.9 : 1) * (B > 1 ? 1 + (B - 1) * 0.85 : B),
    thigh: kid ? 17 : fem ? 21.6 : 21.2, shin: kid ? 16.5 : fem ? 21.0 : 20.6,
    torso: kid ? 18.5 : B >= 1.25 ? 22.8 : 21.6, neck: fem ? 4.0 : 3.7, headR: kid ? 7.6 : B >= 1.25 ? 6.9 : 6.8,
    ua: kid ? 11.5 : 13.8, fa: kid ? 10.5 : 12.6, limb: B * (fem ? (o === 'ninja' ? 0.93 : 0.88) : 1),
    skin, hair: col(L.hair, '#3a2a20'), eyes: col(L.eyes, '#6a4a2a'), eyeGlow: !!L.eyeGlow, beard: L.beard || null,
    hs: L.hairStyle || 'short', hg: L.headgear || null, hgC: L.headColor || null,
    pr, se, tr, pants: col(L.pants, '#2a2420'), boots: col(L.boots, '#1a1410'),
    armor, ac, at, heavy,
    cape: L.cape ? { c: col(L.cape.color, pr), c2: col(L.cape.color2, se), len: L.cape.len ?? 1, style: L.cape.style || null } : null,
    scarf: L.scarf ? { c: col(L.scarf.color, '#8a1a1a'), long: !!L.scarf.long } : null,
    wings: L.wings || null, halo: !!L.halo,
    aura: L.aura || L.accAura || null, auraK: L.aura ? 1 : 0.55, runes: L.markings === 'runes',
    defH: kid ? 0.8 : 1,
    // 머리띠: 헌터는 진홍 머리띠(꼬리 펄럭임), 닌자는 쇠 이마 보호대
    band: L.band ?? (o === 'hunter' && !L.headgear ? col(L.secondary, '#8a1426') : null),
    hachi: o === 'ninja' && (L.headgear === 'mask' || !L.headgear),
  };
  // 부위별 색
  let torsoC = pr, sleeve = pr, fore = pr, glove = '#2a1a14', belt = '#241410', lining = se, tall = true, cuff = tr;
  switch (o) {
    case 'nun': glove = '#ece6da'; belt = se; lining = se; cuff = tr; break;
    case 'gunslinger': glove = '#3a2418'; belt = '#3a2414'; lining = sh(pr, -0.4); break;
    case 'knight': torsoC = K.ac; sleeve = sh(K.ac, -0.05); fore = K.ac; glove = K.ac; belt = '#3a2418'; lining = se; break;
    case 'ninja': glove = se; fore = se; belt = se; cuff = K.tr; break;
    case 'noble': glove = '#141016'; belt = '#1a1014'; lining = se; break;
    case 'villager': glove = skin; belt = se; tall = false; break;
    case 'priest': glove = skin; belt = se; tall = false; break;
    case 'merchant': glove = '#5a3a24'; belt = '#3a2414'; break;
    case 'smith': fore = skin; glove = '#3a2a1a'; belt = '#2a1a10'; break;
    case 'innkeeper': case 'girl': glove = skin; fore = skin; tall = false; belt = se; break;
    case 'lady': glove = '#f0e8e8'; tall = false; belt = se; break;
    default: break;
  }
  if (heavy) { fore = K.ac; glove = sh(K.ac, -0.08); }
  if (armor === 'chain') sleeve = K.ac;
  Object.assign(K, { torsoC, sleeve, fore, glove, belt, lining, tall, cuff });
  K.ls = (K.thigh + K.shin) / 39.8;
  K.W = weaponSpec(L.weapon, p);
  K.off = K.W.type === 'dagger' || K.W.type === 'gun';
  K.auraC = K.aura?.color || '#b98cff';
  K.magicC = K.aura?.color || (K.W.element ? EL_COL[K.W.element] : o === 'nun' ? '#fff2b0' : '#b98cff');
  K.trailC = L.trailColor || { azel: '#ff2a50', lia: '#b8a8ff', bran: '#ffa040', sera: '#ffe890', kael: '#ffd8a0', victor: '#ffc860' }[cid] || (K.W.type === 'greatsword' ? '#ffa040' : K.W.type === 'staff' ? '#ffe890' : '#a8ccff');
  return K;
}
const SPEC = new WeakMap();
function specOf(look, p) {
  let K = SPEC.get(look);
  const cid = p?.ch?.id || null;
  const pup = PUP.puppetFor(p, look);               // 채색 퍼펫 (준비 전·에셋 없음 → null = 벡터)
  const pk = pup ? pup.key : null;
  if (!K || K.cid !== cid || (K.pupKey ?? null) !== pk) {
    K = buildSpec(look, p);
    if (pup) PUP.applySpec(K, pup);
    K.pupKey = pk;
    SPEC.set(look, K);
  }
  return K;
}

// ───────────────────────── 자세(pose) ─────────────────────────
// a1/a2: 어깨→손 방향(캔버스 각도, 0=앞, HP=아래, -HP=위), r1/r2: 팔 뻗음(0~1), w1/w2: 무기 방향
// f1/f2: 발목 목표 위치(가까운/먼 다리), rot: 몸 회전(공중제비), sx: 가로 배율(회전 베기), sq: 찌그러짐
const PK = ['px', 'py', 'lean', 'hd', 'f1x', 'f1y', 'f2x', 'f2y', 't1', 't2', 'a1', 'r1', 'a2', 'r2', 'w1', 'w2', 'rot', 'sx', 'sq', 'ox'];
const PANG = { lean: 1, hd: 1, a1: 1, a2: 1, w1: 1, w2: 1, rot: 1 };
function resetPose(P) {
  P.px = 0; P.py = -41; P.lean = 0.03; P.hd = 0; P.f1x = 5.5; P.f1y = -2.8; P.f2x = -6; P.f2y = -2.8; P.t1 = 0; P.t2 = 0;
  P.a1 = HP - 0.25; P.r1 = 0.88; P.a2 = HP + 0.2; P.r2 = 0.9; P.w1 = HP; P.w2 = HP; P.rot = 0; P.sx = 1; P.sq = 1; P.ox = 0;
  P.pvy = -46; P.e1 = 1; P.e2 = 1; P.two = 0;
  return P;
}
const newPose = () => resetPose({});
function copyPose(D, S) { for (const k of PK) D[k] = S[k]; D.pvy = S.pvy; D.e1 = S.e1; D.e2 = S.e2; D.two = S.two; return D; }
function lerpPose(P, A, B, k) { for (const key of PK) P[key] = A[key] + (B[key] - A[key]) * k; P.pvy = A.pvy + (B.pvy - A.pvy) * k; }
function blendPose(P, A, k) {
  for (const key of PK) {
    const a = A[key]; let b = P[key];
    if (PANG[key]) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); b = a + d; }
    P[key] = a + (b - a) * k;
  }
}
const PB = newPose(), PR = newPose(), PE = newPose(), PT = newPose(), PS = newPose();
// 애니메이션 부가 상태 (자세 외: 채찍·궤적·마법진 등)
function newST() { return { atk: null, mv: null, ph: 0, u: 0, t: 0, air: false, spin: null, th: 0, lash: 0, charge: 0, circle: 0, cast: 0, fire1: 0, fire2: 0, plunge: 0, dash: null, dashK: 0, hurt: 0, throwK: 0, coil: false }; }
const ST = newST(), ST2 = newST();

// ── 기본 자세들 ──
function poseIdle(P, K, t, npc) {
  const br = Math.sin(t * 2.1), br2 = Math.sin(t * 0.37);
  P.py = -41 + br * 0.35; P.lean = 0.035 + br * 0.01; P.hd = 0.02 - br * 0.012 + (npc ? br2 * 0.06 : 0);
  P.f1x = 5; P.f1y = -2.8; P.f2x = -6.5; P.f2y = -2.8;
  P.a1 = HP - 0.26 + br * 0.02; P.r1 = 0.88; P.a2 = HP + 0.22 - br * 0.02; P.r2 = 0.9;
  if (K.fem) { P.f1x = 3.5; P.f2x = -4.5; P.a2 = HP + 0.12; }
  if (K.B >= 1.25) { P.f1x = 7; P.f2x = -8.5; P.a1 = HP - 0.34; P.a2 = HP + 0.32; }
  if (!npc) { // 플레이어: 무릎을 살짝 굽힌 전투 대기 자세
    P.py += 0.9; P.f1x += 1.6; P.f2x -= 1.4; P.lean += 0.03; P.hd -= 0.03;
  }
}
// ── NPC 동작: talk(말하기)·gesture(손짓) — 마을·스토리 NPC (벡터·채색 퍼펫 공용). 대기 자세 위에 가중치 k 로 얹는다 ──
const NPC_GEST = 1.6;                             // 손짓 한 번의 길이(초)
/** NPC 손짓 조정값(갤러리·QA 에서 바꿔 볼 수 있게 export): gestA = 어깨→손 방향(0=앞, -HP=위), gestR = 팔 뻗음.
 *  -0.45(얼굴 높이)는 3/4 채색 NPC(하드윈·로크·로크2)에서 가까운 손이 얼굴을 가려 어깨 높이(-0.1)로 낮췄다 (heroes3 노트 §4) */
export const NPC_POSE = { gestA: -0.1, gestR: 0.84 };
const smooth01k = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
function poseTalk(P, t, k) {
  if (k <= 0) return;
  const b = Math.sin(t * 7.3), b2 = Math.sin(t * 2.9 + 1);
  P.hd += (0.045 * b + 0.03 * b2) * k; P.lean += 0.015 * b2 * k;          // 고개 끄덕임
  P.a1 = lerp(P.a1, 0.9 + 0.14 * Math.sin(t * 4.6), k);                    // 가까운 손이 가슴 앞에서 박자를 맞춤
  P.r1 = lerp(P.r1, 0.6 + 0.05 * Math.sin(t * 4.6 + 1), k);
}
/** at: 손짓 시작 후 시간(초, 0~NPC_GEST). 반환: 가중치(0~1, 편 손 전환 판단용) */
function poseGesture(P, at, k) {
  const env = smooth01k(0, 0.3, at) * (1 - smooth01k(NPC_GEST - 0.4, NPC_GEST, at)) * k;
  if (env <= 0) return 0;
  const wave = Math.sin((at - 0.3) * 9) * 0.12 * smooth01k(0.3, 0.5, at);
  P.a1 = lerp(P.a1, NPC_POSE.gestA + wave, env); P.r1 = lerp(P.r1, NPC_POSE.gestR, env);    // 가까운 손을 앞으로 들어 흔듦
  P.hd -= 0.06 * env; P.lean -= 0.03 * env;
  return env;
}
function npcHash(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
/** NPC 대기 생기: 대사 창의 현재 화자(game.top.cur.who)가 이 NPC 면 말하기, 플레이어가 다가오면 인사 손짓, 그 밖엔 NPC 마다 다른 주기로 가끔 손짓 */
function npcLife(P, p, world, tt, rig, dt) {
  const id = PUP.npcIdOf(p, p.look);
  if (!id) return;                                // 데이터에 없는 NPC(결투 상대 등)는 그대로
  const top = world?.game?.top;
  const talking = !!(top && top.cur && top.cur.who === id);
  const S = rig ? (rig.npcLife ||= { talkK: 0, gest: -99, near: false }) : null;
  let tk = talking ? 1 : 0;
  if (S) { S.talkK += clamp(tk - S.talkK, -dt * 4, dt * 4); tk = S.talkK; }
  if (tk > 0.001) poseTalk(P, tt, tk);
  let gat = -1;
  if (S) {
    const pl = world?.player;
    const near = !!(pl && Math.abs(pl.cx - p.cx) < 70 && Math.abs((pl.bottom ?? 0) - (p.bottom ?? 0)) < 60);
    if (near && !S.near && tt - S.gest > 4) S.gest = tt;
    S.near = near;
    gat = tt - S.gest;
  }
  if (!(gat >= 0 && gat < NPC_GEST) && !talking) {
    const h = npcHash(id), per = 9 + (h % 5), ph = (tt + (h % 97) * 0.13) % per;
    if (ph < NPC_GEST) gat = ph;
  }
  if (gat >= 0 && gat < NPC_GEST && tk < 0.5 && poseGesture(P, gat, 1 - tk) > 0.35) ST.throwK = 1;
}
function poseStance(P, K) {
  P.py = -39.5; P.lean = 0.12; P.hd = -0.06; P.f1x = 8; P.f1y = -2.8; P.f2x = -9.5; P.f2y = -2.8;
  P.a1 = HP - 0.42; P.r1 = 0.8; P.a2 = HP + 0.08; P.r2 = 0.84;
}
function poseRun(P, K, ph, sp) {
  const s1 = Math.sin(ph), c1 = Math.cos(ph), sp2 = clamp(sp, 0.35, 1.2);
  P.py = -40 + 1.9 * Math.cos(2 * ph) * sp2 + 0.6;
  P.lean = 0.16 + 0.1 * sp2 + 0.03 * Math.sin(2 * ph); P.hd = -0.12;
  const A = 14 * sp2, lift = 12 * sp2;
  P.f1x = 2 + A * s1; P.f1y = -2.8 - Math.max(0, Math.cos(ph + 0.45)) * lift;
  P.f2x = 2 - A * s1; P.f2y = -2.8 - Math.max(0, Math.cos(ph + PI + 0.45)) * lift;
  P.t1 = Math.max(0, c1) * 0.7 + Math.max(0, -s1) * 0.35; P.t2 = Math.max(0, -c1) * 0.7 + Math.max(0, s1) * 0.35;
  P.a1 = HP - 0.2 + 1.0 * s1 * sp2; P.r1 = 0.7; P.a2 = HP - 0.2 - 1.0 * s1 * sp2; P.r2 = 0.7;
}
function poseAir(P, vy) {
  const k = clamp((vy + 250) / 700, 0, 1);
  P.py = -41; P.lean = lerp(0.16, 0.04, k); P.hd = lerp(-0.14, 0.16, k);
  P.f1x = lerp(9, 7, k); P.f1y = lerp(-19, -9, k); P.f2x = lerp(-4, -8, k); P.f2y = lerp(-4, -13, k);
  P.t1 = lerp(0.55, 0.35, k); P.t2 = lerp(0.95, 0.55, k);
  P.a1 = lerp(0.25, -0.55, k); P.r1 = lerp(0.72, 0.9, k); P.a2 = lerp(2.35, 3.4, k); P.r2 = lerp(0.85, 0.92, k);
}
function airLegs(P) { P.py = -41; P.f1x = 8; P.f1y = -14; P.f2x = -6; P.f2y = -8; P.t1 = 0.45; P.t2 = 0.7; }
function poseCrouch(P) {
  P.py = -25; P.lean = 0.34; P.hd = -0.3; P.f1x = 9.5; P.f1y = -2.8; P.f2x = -8.5; P.f2y = -2.8; P.t2 = 0.45;
  P.a1 = HP - 0.6; P.r1 = 0.72; P.a2 = HP + 0.1; P.r2 = 0.82;
}
function poseDash(P, type, at) {
  if (type === 'roll') {
    const u = clamp(at / 0.2, 0, 1);
    P.rot = TAU * ease.inOutQuad(u); P.pvy = -26; P.py = -34; P.lean = 0.5; P.hd = 0.4;
    P.f1x = 9; P.f1y = -18; P.f2x = 3; P.f2y = -12; P.t1 = 0.8; P.t2 = 0.8;
    P.a1 = 0.9; P.r1 = 0.55; P.a2 = 1.1; P.r2 = 0.55;
    return;
  }
  const blink = type === 'blink';
  P.py = blink ? -40 : -34; P.lean = blink ? 0.3 : 0.58; P.hd = -P.lean * 0.7;
  P.f1x = blink ? 8 : 16; P.f1y = blink ? -8 : -5; P.f2x = blink ? -12 : -22; P.f2y = blink ? -6 : -13; P.t1 = 0.2; P.t2 = 0.9;
  P.a1 = 2.45; P.r1 = 0.94; P.a2 = 2.7; P.r2 = 0.94;
}
function poseWall(P) {
  P.py = -40; P.lean = -0.12; P.hd = 0.3; P.f1x = 11; P.f1y = -14; P.f2x = 8; P.f2y = -3.5; P.t1 = -0.9; P.t2 = -0.4;
  P.a1 = -0.62; P.r1 = 0.96; P.a2 = HP + 0.4; P.r2 = 0.85;
}
function poseHurt(P, at) {
  const k = 1 - clamp(at / 0.3, 0, 1) * 0.6;
  P.py = -40; P.lean = -0.36 * k; P.hd = -0.45 * k; P.f1x = 10; P.f1y = -9; P.f2x = -4; P.f2y = -3; P.t1 = 0.5;
  P.a1 = lerp(HP, -0.8, k); P.r1 = 0.85; P.a2 = lerp(HP, -2.1, k); P.r2 = 0.85; P.sq = 1 - 0.05 * k;
}
function poseDeath(P, at) {
  // 0~0.2 피격 반동(젖혀짐) → 0.16~0.62 뒤로 쓰러짐(가속) → 착지 반동 → 누운 자세(한쪽 무릎 세움)
  const k1 = ease.outCubic(clamp(at / 0.2, 0, 1));
  const u = clamp((at - 0.16) / 0.46, 0, 1), k2 = ease.inOutQuad(u);
  const land = at > 0.62 ? at - 0.62 : 0;
  const bounce = land ? Math.exp(-land * 9) * Math.sin(land * 26) * 0.08 : 0;
  P.py = lerp(-40, -33, k2); P.lean = lerp(-0.45 * k1, -0.08, k2); P.hd = lerp(-0.55 * k1, -0.3, k2) + bounce * 2;
  P.f1x = lerp(lerp(5, 11, k1), 3, k2); P.f1y = lerp(lerp(-2.8, -10, k1), -2.5, k2);
  P.f2x = lerp(lerp(-6, -3, k1), 7, k2); P.f2y = lerp(-2.8, -8, k2); P.t1 = lerp(0.4 * k1, 0, k2); P.t2 = lerp(0, 0.4, k2);
  // 팔: 뒤로 휘둘려 벌어짐 → 누우면 머리 위 바닥에 늘어짐. 무기는 바닥과 나란히 떨어짐
  P.a1 = lerp(lerp(HP, -2.5, k1), -2.1, k2); P.r1 = lerp(0.9, 0.95, k2); P.a2 = lerp(lerp(HP, 2.7, k1), -2.75, k2); P.r2 = 0.95;
  P.w1 = lerp(P.a1 + 0.9, -1.72, k2); P.w2 = lerp(P.a2 + 0.9, -1.62, k2);
  P.rot = -1.5 * ease.inQuad(u) + bounce; P.pvy = -6; P.ox = 30 * k2;
  P.sq = land ? 1 - Math.exp(-land * 14) * 0.08 : 1;
}
function poseThrow(P, K, at) {
  const u = clamp(at / 0.22, 0, 1), k = ease.outCubic(u);
  P.lean = lerp(-0.12, 0.28, k); P.py = -40; P.f1x = 10; P.f2x = -9;
  const whip = K.W.type === 'whip';
  const a = lerp(-2.5, -0.15, k), r = lerp(0.85, 1, k);
  if (whip) { P.a1 = a; P.r1 = r; P.a2 = lerp(0.4, 2.2, k); }
  else { P.a2 = a; P.r2 = r; P.a1 = lerp(HP - 0.3, HP + 0.3, k); }
  // 채색 퍼펫 + 지팡이: 대기 자세의 지팡이 기울기 그대로면 손이 내려가며 지팡이 머리가 얼굴을 가린다(세라 성수 투척) → 앞으로 비스듬히
  if (K.pup && K.W.type === 'staff') P.w1 = lerp(-0.95, -0.7, k);
}
function poseCast(P, K, at, t) {
  const k = ease.outCubic(clamp(at / 0.1, 0, 1));
  P.py = -40; P.lean = 0.14 * k; P.hd = -0.08; P.f1x = 9; P.f2x = -9;
  P.a2 = lerp(HP, -0.12 + Math.sin(t * 20) * 0.03, k); P.r2 = 0.95;
  if (K.W.type === 'staff') { P.a1 = lerp(HP - 0.5, -0.4, k); P.r1 = 0.95; P.w1 = lerp(-HP, -0.7, k); }
}
function poseCharge(P, K, k, t) {
  const sh2 = k >= 1 ? Math.sin(t * 60) * 0.35 : 0;
  P.py = -37; P.lean = 0.2; P.hd = -0.15; P.f1x = 10; P.f2x = -11; P.px = sh2;
  const w = K.W.type;
  if (w === 'whip') { P.a1 = -1.45; P.r1 = 0.96; P.w1 = -1.62; P.a2 = HP + 0.3; }
  else if (w === 'gun') { P.a1 = -0.06; P.r1 = 1; P.w1 = -0.05; P.a2 = 0.1; P.r2 = 0.86; P.w2 = -0.02; P.lean = 0.02; }
  else if (w === 'staff') { P.a1 = -1.5; P.r1 = 1; P.w1 = -HP; P.a2 = -1.2; P.r2 = 0.9; P.lean = -0.05; }
  else { P.a1 = 2.45; P.r1 = 0.86; P.w1 = 2.95; P.a2 = 0.5; P.r2 = 0.8; if (w === 'greatsword') P.two = 1; if (w === 'dagger') { P.a2 = 2.7; P.w2 = 3.0; } }
}
/** 비공격 상태의 무기 쥐는 법 */
function holdFor(P, K, mode) {
  const w = K.W.type;
  if (w === 'sword') {
    if (mode === 'run') P.w1 = 2.45 + (P.a1 - HP) * 0.3;
    else if (mode === 'air') { P.a1 = -0.3; P.r1 = 0.86; P.w1 = -0.8; }
    else if (mode === 'dash') P.w1 = 3.05;
    else if (mode === 'crouch') { P.w1 = 0.25; P.a1 = 0.45; P.r1 = 0.8; }
    else { P.a1 = HP - 0.42; P.r1 = 0.78; P.w1 = 0.62; }
  } else if (w === 'greatsword') {
    if (mode === 'dash') { P.w1 = 3.0; P.a1 = 2.4; }
    else if (mode === 'crouch') { P.a1 = 0.45; P.r1 = 0.62; P.w1 = -2.5; }
    else { P.a1 = 0.75; P.r1 = 0.4; P.w1 = -2.72; }
  } else if (w === 'dagger') {
    if (mode === 'run' || mode === 'dash') { P.a1 = 2.35; P.r1 = 0.95; P.w1 = 2.95; P.a2 = 2.55; P.r2 = 0.95; P.w2 = 3.05; P.lean = Math.max(P.lean, 0.42); }
    else if (mode === 'air') { P.w1 = HP + 1.0; P.w2 = HP + 1.1; }
    else { P.a1 = HP - 0.6; P.r1 = 0.72; P.w1 = HP + 0.55; P.a2 = HP - 0.25; P.r2 = 0.74; P.w2 = HP + 0.6; }
  } else if (w === 'gun') {
    P.w1 = P.a1 - 0.3; P.w2 = P.a2 - 0.35;
    if (mode === 'air') { P.w1 = P.a1 + 0.2; }
  } else if (w === 'whip') {
    if (mode === 'idle') { P.a1 = HP - 0.12; P.r1 = 0.66; P.e1 = 1; } // 허리의 채찍에 손을 얹음
  } else if (w === 'staff') {
    if (mode === 'run') { P.a1 = HP - 0.45 + (P.a1 - HP) * 0.3; P.r1 = 0.72; P.w1 = -2.15; }
    else if (mode === 'air') { P.a1 = -0.4; P.r1 = 0.8; P.w1 = -1.05; }
    else if (mode === 'dash') { P.w1 = 2.9; }
    else if (mode === 'crouch') { P.a1 = HP - 0.9; P.r1 = 0.7; P.w1 = -HP - 0.35; }
    else { P.a1 = HP - 0.64; P.r1 = 0.66; P.w1 = -HP - 0.12; }
    // 채색 퍼펫: 어깨가 원화 위치(몸 뒤쪽)라 곧게 세운 지팡이 머리가 얼굴을 가린다 → 손을 앞으로, 지팡이를 앞으로 기울임
    if (K.pup && (mode === 'idle' || mode === 'stance' || mode === 'crouch')) { P.a1 -= 0.28; P.r1 = Math.max(P.r1, 0.74); P.w1 += mode === 'crouch' ? 0.62 : 0.42; }
  }
}

// ── 공격 키포즈: R=예비동작 끝(판정 직전), E=판정 끝 ──
// lash: 1=목표점까지 직선 채찍, 2=위로, 3=아래로 / trail: 1=가까운 손 무기 궤적, 2=먼 손 / streak: 찌르기 섬광
const AK = {
  lash: { R: { a1: -2.45, r1: 0.86, w1: -2.5, lean: -0.14, a2: 0.35, r2: 0.8, py: -41, f1x: 8, f2x: -9 }, E: { a1: -0.06, r1: 1, w1: 0.02, lean: 0.24, a2: 2.3, r2: 0.85, py: -38, f1x: 14, f2x: -12 }, lash: 1 },
  lash_up: { R: { a1: -2.45, r1: 0.86, w1: -2.5, lean: -0.14, a2: 0.35, r2: 0.8, py: -41 }, E: { a1: -0.62, r1: 1, w1: -0.64, lean: 0.1, a2: 2.4, r2: 0.85, py: -39, f1x: 12, f2x: -11 }, lash: 1 },
  lash_low: { R: { a1: -2.2, r1: 0.86, w1: -2.4, lean: -0.05, py: -38, a2: 0.4 }, E: { a1: 0.5, r1: 1, w1: 0.36, lean: 0.4, a2: 2.4, py: -33, f1x: 17, f2x: -12 }, lash: 1 },
  crouch_lash: { base: 'crouch', R: { a1: -2.1, r1: 0.8, w1: -2.3 }, E: { a1: 0.3, r1: 1, w1: 0.08, lean: 0.4, a2: 2.4 }, lash: 1 },
  lash_down: { R: { a1: -2.1, r1: 0.85, w1: -2.3, lean: -0.1 }, E: { a1: 0.78, r1: 1, w1: 0.72, lean: 0.3, a2: 2.5 }, lash: 1, ty: 0.8 },
  launch: { R: { a1: 1.9, r1: 0.9, w1: 2.3, py: -34, lean: 0.25 }, E: { a1: -1.45, r1: 1, w1: -1.52, py: -42, lean: -0.08, a2: 1.9, hd: -0.3 }, lash: 2 },
  down: { R: { a1: 0.2, r1: 0.9, w1: 0.1 }, E: { a1: 1.2, r1: 1, w1: 1.4, lean: 0.15, hd: 0.35 }, lash: 3 },
  spin: { spin: 'whip' },
  // 장검
  slash_down: { R: { a1: -2.15, r1: 0.9, w1: -2.35, lean: -0.1, a2: 0.6, r2: 0.7, f1x: 8, f2x: -10 }, E: { a1: 0.85, r1: 1, w1: 1.05, lean: 0.32, a2: 2.4, r2: 0.85, py: -36, f1x: 15, f2x: -12 }, trail: 1 },
  slash_up: { R: { a1: 1.35, r1: 0.9, w1: 2.0, lean: 0.25, py: -37, a2: -0.2 }, E: { a1: -1.35, r1: 1, w1: -1.55, lean: -0.1, py: -40, a2: 2.3, f1x: 12, f2x: -11 }, trail: 1 },
  thrust: { R: { a1: 2.5, r1: 0.42, w1: 0.08, lean: -0.12, a2: 0.4, r2: 0.7, f1x: 7, f2x: -10 }, E: { a1: -0.04, r1: 1, w1: -0.02, lean: 0.36, a2: 2.6, r2: 0.95, py: -35, f1x: 21, f2x: -14 }, trail: 1, streak: 1 },
  slash_wide: { R: { a1: -2.7, r1: 0.95, w1: -2.95, lean: -0.22, a2: 0.8, py: -40 }, E: { a1: 1.55, r1: 1, w1: 2.35, lean: 0.42, a2: 2.6, py: -33, f1x: 18, f2x: -14 }, trail: 1 },
  spin_blade: { spin: 'blade' },
  uppercut: { R: { a1: 2.0, r1: 0.9, w1: 2.45, py: -31, lean: 0.35, a2: 0.3 }, E: { a1: -1.42, r1: 1, w1: -1.5, py: -42, lean: -0.15, a2: 2.2, f1x: 6, f1y: -9, hd: -0.3 }, trail: 1 },
  plunge: { plunge: 1 },
  crouch_slash: { base: 'crouch', R: { a1: -1.3, r1: 0.9, w1: -1.6 }, E: { a1: 0.62, r1: 1, w1: 0.45, lean: 0.42, a2: 2.4 }, trail: 1 },
  // 대검 (양손)
  heavy_down: { two: 1, R: { a1: -1.95, r1: 0.72, w1: -2.6, lean: -0.22, py: -39, f1x: 9, f2x: -12 }, E: { a1: 0.95, r1: 1, w1: 0.98, lean: 0.46, py: -30, f1x: 19, f2x: -15 }, trail: 1 },
  heavy_up: { two: 1, R: { a1: 1.6, r1: 0.88, w1: 2.25, py: -31, lean: 0.38 }, E: { a1: -1.25, r1: 1, w1: -1.3, py: -41, lean: -0.18, f1x: 12, f2x: -12, hd: -0.25 }, trail: 1 },
  heavy_spin: { spin: 'great' },
  heavy_low: { two: 1, R: { a1: 2.6, r1: 0.8, w1: 2.95, py: -31, lean: 0.2 }, E: { a1: 0.4, r1: 1, w1: 0.14, py: -28, lean: 0.52, f1x: 22, f2x: -14 }, trail: 1 },
  // 단검 (쌍수)
  stab: { R: { a1: 2.3, r1: 0.5, w1: 0.2, lean: 0.05, a2: 0.9, r2: 0.45, w2: 2.4 }, E: { a1: -0.08, r1: 1, w1: -0.1, lean: 0.32, py: -37, f1x: 14, f2x: -10, a2: 1.0, r2: 0.45, w2: 2.4 }, trail: 1, streak: 1 },
  stab_alt: { R: { a2: 2.3, r2: 0.5, w2: 0.2, a1: 0.9, r1: 0.5, w1: 2.3, lean: 0.05 }, E: { a2: -0.02, r2: 1, w2: -0.05, a1: 1.9, r1: 0.55, w1: 2.5, lean: 0.36, py: -37, f1x: 13, f2x: -11 }, trail: 2, streak: 2 },
  crouch_stab: { base: 'crouch', R: { a1: 2.2, r1: 0.5, w1: 0.3 }, E: { a1: 0.28, r1: 1, w1: 0.18, lean: 0.45 }, trail: 1, streak: 1 },
  dive_kick: { dive: 1 },
  // 총 (gun: 1=가까운 손 2=먼 손 3=양손)
  shoot: { gun: 1, E: { a1: -0.02, r1: 1, w1: -0.02, lean: -0.02, a2: HP - 0.1, r2: 0.85, w2: HP - 0.3 } },
  shoot_alt: { gun: 2, E: { a2: 0.1, r2: 1, w2: 0.08, a1: HP - 0.5, r1: 0.75, w1: HP - 0.7, lean: 0.03 } },
  shoot_double: { gun: 3, E: { a1: -0.02, r1: 1, w1: -0.02, a2: 0.12, r2: 1, w2: 0.1, lean: -0.05, f1x: 10, f2x: -12 } },
  shoot_up: { gun: 3, E: { a1: -1.05, r1: 1, w1: -1.05, a2: -0.95, r2: 0.97, w2: -0.95, lean: -0.12, hd: -0.35 } },
  shoot_down: { gun: 3, legs: 1, E: { a1: 1.4, r1: 1, w1: 1.57, a2: 1.62, r2: 1, w2: 1.57, lean: 0.1, hd: 0.4, f1x: 11, f1y: -13, f2x: -10, f2y: -14, t1: 0.6, t2: 0.6 } },
  crouch_shoot: { gun: 1, base: 'crouch', E: { a1: 0.3, r1: 1, w1: 0, lean: 0.2, a2: 0.9, r2: 0.6, w2: HP } },
  slide_shoot: { gun: 1, legs: 1, E: { a1: 0.1, r1: 1, w1: 0, lean: -0.45, py: -21, f1x: 22, f1y: -3, f2x: -3, f2y: -9, hd: 0.35, a2: 2.6, r2: 0.9, w2: 2.0 } },
  // 지팡이
  staff_swing: { R: { a1: -2.15, r1: 0.85, w1: -2.4, lean: -0.1, a2: 0.4 }, E: { a1: 0.82, r1: 1, w1: 0.95, lean: 0.3, a2: 2.3, py: -37, f1x: 14, f2x: -11 }, trail: 1 },
  staff_swing_up: { R: { a1: 1.3, r1: 0.9, w1: 1.95, lean: 0.22, py: -37 }, E: { a1: -1.3, r1: 1, w1: -1.5, lean: -0.08, a2: 2.3, f1x: 12, f2x: -11 }, trail: 1 },
  cast: { cast: 1, R: { a1: -2.0, r1: 0.85, w1: -1.9, lean: -0.08, a2: 2.2 }, E: { a1: -0.3, r1: 1, w1: -0.5, lean: 0.18, a2: -0.12, r2: 0.9, f1x: 12, f2x: -10 } },
  cast_up: { cast: 2, R: { a1: 0.6, r1: 0.7, w1: -HP, py: -37, lean: 0.1 }, E: { a1: -1.5, r1: 1, w1: -1.6, a2: -1.25, r2: 0.95, lean: -0.1, hd: -0.35, py: -42 } },
};
const LEGK = ['px', 'py', 'f1x', 'f1y', 'f2x', 'f2y', 't1', 't2'];
function keepLegs(P, B) { for (const k of LEGK) P[k] = B[k]; }

const PH = { ph: 0, u: 0, t: 0, h0: 0, h1: 0, dur: 0 };
function phaseAt(mv, t) {
  const dur = mv.dur || 0.3;
  const h0 = mv.hit ? mv.hit[0] : dur * 0.3;
  let h1 = mv.hit ? mv.hit[1] : h0 + 0.1;
  if (h1 < h0 + 0.03) h1 = h0 + 0.03;
  PH.t = t; PH.h0 = h0; PH.h1 = h1; PH.dur = dur;
  if (t < h0) { PH.ph = 0; PH.u = h0 > 0 ? t / h0 : 1; }
  else if (t < h1) { PH.ph = 1; PH.u = (t - h0) / (h1 - h0); }
  else { PH.ph = 2; PH.u = clamp((t - h1) / Math.max(0.02, dur - h1), 0, 1); }
  return PH;
}
const recoverEase = (u) => (u < 0.22 ? 0 : ease.inOutQuad((u - 0.22) / 0.78));
function setBase(P, p, K, kind) {
  resetPose(P);
  if (kind === 'crouch') { poseCrouch(P); holdFor(P, K, 'crouch'); }
  else if (kind === 'air') { poseStance(P, K); airLegs(P); holdFor(P, K, 'stance'); }
  else { poseStance(P, K); holdFor(P, K, 'stance'); }
}

/** 공격 자세 (t = 경과초 × 공격속도) */
function attackPose(P, S, p, K, mv, t) {
  const def = AK[mv.anim] || (K.W.type === 'whip' ? AK.lash : K.W.type === 'gun' ? AK.shoot : AK.slash_down);
  const air = p.onGround === false;
  const ph = phaseAt(mv, t);
  S.atk = def; S.mv = mv; S.ph = ph.ph; S.u = ph.u; S.t = t; S.air = air;
  const kind = def.base === 'crouch' ? 'crouch' : air ? 'air' : 'stance';
  if (def.spin) return spinPose(P, S, p, K, ph, def.spin, air);
  if (def.plunge) return plungePose(P, S, p, K, ph);
  if (def.dive) return divePose(P, S, p, K, ph);
  setBase(PB, p, K, kind);
  if (def.gun) return gunPose(P, S, p, K, ph, def, kind);
  copyPose(PR, PB); Object.assign(PR, def.R); if (kind !== 'stance') keepLegs(PR, PB);
  copyPose(PE, PB); Object.assign(PE, def.E); if (kind !== 'stance') keepLegs(PE, PB);
  if (ph.ph === 0) lerpPose(P, PB, PR, ease.outCubic(ph.u));
  else if (ph.ph === 1) lerpPose(P, PR, PE, ease.outCubic(ph.u));
  else lerpPose(P, PE, PB, recoverEase(ph.u));
  P.two = def.two ? 1 : 0; P.pvy = -46;
  if (def.lash) S.lash = def.lash;
  if (def.cast) { S.cast = def.cast; S.circle = ph.ph === 0 ? ph.u : ph.ph === 1 ? 1 : 1 - ph.u; }
}
function spinPose(P, S, p, K, ph, kind, air) {
  setBase(PB, p, K, air ? 'air' : 'stance');
  copyPose(PR, PB); Object.assign(PR, { a1: 2.5, r1: 0.9, w1: 2.9, lean: -0.15, a2: 0.5, r2: 0.8 });
  if (!air) Object.assign(PR, { py: -36, f1x: 11, f2x: -12 });
  if (kind === 'great') PR.two = 1;
  const somer = kind === 'blade' && air;
  const turns = kind === 'blade' ? (air ? 1 : 2) : 1.5;
  S.spin = kind; S.lash = kind === 'whip' ? 4 : 0;
  if (ph.ph === 0) { lerpPose(P, PB, PR, ease.outCubic(ph.u)); S.th = 0; P.two = PR.two; return; }
  copyPose(PE, PR);
  Object.assign(PE, { a1: -0.1, r1: 1, w1: kind === 'whip' ? -0.1 : 0.02, a2: 2.5, r2: 0.82, lean: 0.12, hd: -0.05 });
  if (somer) Object.assign(PE, { f1x: 7, f1y: -25, f2x: 0, f2y: -20, t1: 0.7, t2: 0.7, lean: 0.4, a2: 1.0, r2: 0.6 });
  if (ph.ph === 1) {
    const th = ph.u * turns * TAU;
    copyPose(P, PE);
    S.th = th;
    if (somer) { P.rot = th; P.pvy = -50; }
    else { const cs = Math.cos(th); P.sx = (cs < 0 ? -1 : 1) * (0.3 + 0.7 * Math.abs(cs)); }
    return;
  }
  S.th = turns * TAU;
  lerpPose(P, PE, PB, ease.inOutQuad(ph.u));
}
function plungePose(P, S, p, K, ph) {
  setBase(PB, p, K, 'air');
  copyPose(PR, PB); Object.assign(PR, { a1: -1.35, r1: 0.72, w1: -HP, a2: -1.2, r2: 0.72, lean: -0.05, f1x: 7, f1y: -16 });
  copyPose(PE, PB); Object.assign(PE, { a1: 1.28, r1: 0.44, w1: HP, a2: 1.2, r2: 0.46, lean: 0.06, hd: 0.4, f1x: 8, f1y: -22, f2x: -4, f2y: -15, t1: 0.6, t2: 0.9 });
  if (K.W.type === 'staff') Object.assign(PE, { a1: 0.95, r1: 0.7, w1: HP + 0.02, a2: 1.0, r2: 0.6 });
  if (ph.ph === 0) lerpPose(P, PB, PR, ease.outCubic(ph.u));
  else if (ph.ph === 1) lerpPose(P, PR, PE, ease.outCubic(Math.min(1, ph.u * 5)));
  else lerpPose(P, PE, PB, ease.inOutQuad(ph.u));
  P.two = K.W.type === 'staff' ? 0 : 1;
  S.plunge = ph.ph === 1 ? 1 : ph.ph === 2 ? 1 - ph.u : ph.u * 0.5;
}
function divePose(P, S, p, K, ph) {
  setBase(PB, p, K, 'air');
  copyPose(PE, PB);
  Object.assign(PE, { rot: -0.72, pvy: -44, f1x: 12, f1y: -2, t1: 0.3, f2x: -3, f2y: -24, t2: 0.9, a1: 2.6, r1: 0.9, w1: 3.0, a2: 2.8, r2: 0.9, w2: 3.1, lean: 0.1, hd: 0.5 });
  const k = ph.ph === 0 ? ease.outCubic(ph.u) : ph.ph === 1 ? 1 : 1 - ease.inOutQuad(ph.u);
  lerpPose(P, PB, PE, k);
  S.plunge = ph.ph === 1 ? 0.8 : 0;
}
// 채색 퍼펫 총 조준: 원화 어깨는 벡터보다 높아 수평 조준 총구가 탄 생성점(movesets proj.offX/offY → player.js)보다 ≈19px 위였다.
// 조준 자세의 손 목표를 "총구 = 생성점"이 되게 푼다 (게임 배율 기준, 팔꿈치는 IK 로 굽음). 벡터 인형은 그대로.
const AIM_PUP = { shoot: 1, shoot_alt: 1, shoot_double: 1, shoot_up: 1, crouch_shoot: 1, slide_shoot: 1 };
function aimPup(E, K, p, def, mv) {
  const pr = mv?.proj;
  if (!pr || !AIM_PUP[mv.anim]) return;
  const hs = drawScale * (p.look?.height ?? K.defH), mx = weaponReach(K.W) + 1.3, my = -2.6;   // 총구 = 무기 좌표 (1.3·(L+1), −2.6)
  const ux = Math.sin(E.lean), uy = -Math.cos(E.lean), nx = E.px * K.ls + ux * K.torso, ny = E.py * K.ls + uy * K.torso;
  for (const arm of [1, 2]) {
    if (!(def.gun & arm)) continue;
    const a = arm === 1 ? K.pS1 : K.pS2, w = arm === 1 ? E.w1 : E.w2;
    const sx = nx + ux * a[0] - uy * a[1], sy = ny + uy * a[0] + ux * a[1];
    const tx = (pr.offX ?? 30) / hs - (def.gun === 3 && arm === 2 ? 1.5 : 0), ty = (pr.offY ?? -60) / hs - (def.gun === 3 && arm === 2 ? 3 : 0);
    const dx = tx - (Math.cos(w) * mx - Math.sin(w) * my) - sx, dy = ty - (Math.sin(w) * mx + Math.cos(w) * my) - sy;
    const ang = Math.atan2(dy, dx), r = clamp(Math.hypot(dx, dy) / (K.ua + K.fa), 0.5, 1);
    if (arm === 1) { E.a1 = ang; E.r1 = r; } else { E.a2 = ang; E.r2 = r; }
  }
}
function gunPose(P, S, p, K, ph, def, kind) {
  copyPose(PE, PB); Object.assign(PE, def.E);
  if (kind !== 'stance' && !def.legs) keepLegs(PE, PB);
  if (K.pup) aimPup(PE, K, p, def, S.mv);
  const t = ph.t, h0 = ph.h0, dur = ph.dur;
  let k = t < h0 ? ease.outCubic(clamp(t / Math.max(0.01, h0), 0, 1)) : 1;
  if (t > h0) { const r = (t - h0) / Math.max(0.02, dur - h0); if (r > 0.62) k = 1 - ease.inOutQuad((r - 0.62) / 0.38) * 0.85; }
  lerpPose(P, PB, PE, k);
  // 채색 퍼펫: 반동을 0.03초 늦춘다 — 발사 첫 프레임의 총구 섬광이 들린 총구(탄 생성점보다 ≈45px 위)가 아니라 수평 조준 총구에 찍히게
  const kd = K.pup ? 0.03 : 0;
  const kick = t >= h0 + kd ? Math.exp(-(t - h0 - kd) * 26) : 0;
  const g = def.gun;
  if (g & 1) { const sg = P.w1 > 1 ? 1 : -1; P.a1 += sg * kick * 0.42; P.w1 += sg * kick * 0.85; }
  if (g & 2) { const sg = P.w2 > 1 ? 1 : -1; P.a2 += sg * kick * 0.42; P.w2 += sg * kick * 0.85; }
  if (def === AK.shoot_double) { P.lean -= kick * 0.28; P.px -= kick * 3; }
  const m = p.muzzleT > 0 ? clamp(p.muzzleT / 0.06, 0, 1) : 0;
  S.fire1 = g & 1 ? m : 0; S.fire2 = g & 2 ? m : 0;
  S.t = t;
}

// ───────────────────────── 골격 풀이 ─────────────────────────
function mkSk() {
  return { px: 0, py: 0, ux: 0, uy: -1, fx: 1, fy: 0, nx: 0, ny: 0, s1x: 0, s1y: 0, s2x: 0, s2y: 0, e1x: 0, e1y: 0, h1x: 0, h1y: 0, e2x: 0, e2y: 0, h2x: 0, h2y: 0,
    hp1x: 0, hp1y: 0, hp2x: 0, hp2y: 0, k1x: 0, k1y: 0, a1x: 0, a1y: 0, k2x: 0, k2y: 0, a2x: 0, a2y: 0, hx: 0, hy: 0, ha: 0 };
}
const SK = mkSk(), SK2 = mkSk();
const IKO = new Float64Array(4);
function ik(ax, ay, tx, ty, l1, l2, bend) {
  let dx = tx - ax, dy = ty - ay, d = Math.hypot(dx, dy) || 0.001;
  const maxd = (l1 + l2) * 0.999, mind = Math.abs(l1 - l2) + 0.5;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; } else if (d < mind) { dx *= mind / d; dy *= mind / d; d = mind; }
  const base = Math.atan2(dy, dx);
  const A = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const a = base + bend * A;
  IKO[0] = ax + Math.cos(a) * l1; IKO[1] = ay + Math.sin(a) * l1; IKO[2] = ax + dx; IKO[3] = ay + dy;
}
/** 몸통·팔 (궤적 샘플링에도 사용) */
let LS = 1; // 다리 길이 배율 (자세는 다리 39.8px 기준으로 작성)
function solveUpper(P, K, s) {
  LS = K.ls;
  s.ux = Math.sin(P.lean); s.uy = -Math.cos(P.lean);
  s.fx = -s.uy; s.fy = s.ux;
  s.px = P.px * LS; s.py = P.py * LS;
  s.nx = s.px + s.ux * K.torso; s.ny = s.py + s.uy * K.torso;
  if (K.pup) { // 채색 퍼펫: 원화에서 잰 어깨 위치(몸통 좌표계)
    const a = K.pS1, b = K.pS2;
    s.s1x = s.nx + s.ux * a[0] + s.fx * a[1]; s.s1y = s.ny + s.uy * a[0] + s.fy * a[1];
    s.s2x = s.nx + s.ux * b[0] + s.fx * b[1]; s.s2y = s.ny + s.uy * b[0] + s.fy * b[1];
  } else {
    const sd = 2.9;
    s.s1x = s.nx - s.ux * sd + s.fx * 1.3 * K.hW; s.s1y = s.ny - s.uy * sd + s.fy * 1.3 * K.hW;
    s.s2x = s.nx - s.ux * sd - s.fx * 2.4 * K.hW; s.s2y = s.ny - s.uy * sd - s.fy * 2.4 * K.hW;
  }
  const al = K.ua + K.fa;
  ik(s.s1x, s.s1y, s.s1x + Math.cos(P.a1) * P.r1 * al, s.s1y + Math.sin(P.a1) * P.r1 * al, K.ua, K.fa, P.e1);
  s.e1x = IKO[0]; s.e1y = IKO[1]; s.h1x = IKO[2]; s.h1y = IKO[3];
  if (P.two) {
    // 양손 무기: 먼 손은 손잡이 아래쪽
    const gx = s.h1x - Math.cos(P.w1) * 6.5, gy = s.h1y - Math.sin(P.w1) * 6.5;
    ik(s.s2x, s.s2y, gx, gy, K.ua, K.fa, 1);
  } else ik(s.s2x, s.s2y, s.s2x + Math.cos(P.a2) * P.r2 * al, s.s2y + Math.sin(P.a2) * P.r2 * al, K.ua, K.fa, P.e2);
  s.e2x = IKO[0]; s.e2y = IKO[1]; s.h2x = IKO[2]; s.h2y = IKO[3];
}
function solve(P, K, s) {
  solveUpper(P, K, s);
  if (K.pup) {
    const a = K.pH1, b = K.pH2;
    s.hp1x = s.px + s.ux * a[0] + s.fx * a[1]; s.hp1y = s.py + s.uy * a[0] + s.fy * a[1];
    s.hp2x = s.px + s.ux * b[0] + s.fx * b[1]; s.hp2y = s.py + s.uy * b[0] + s.fy * b[1];
  } else {
    s.hp1x = s.px + s.fx * 1.0; s.hp1y = s.py + s.fy * 1.0 + 0.5;
    s.hp2x = s.px - s.fx * 1.4; s.hp2y = s.py - s.fy * 1.4 + 0.5;
  }
  ik(s.hp1x, s.hp1y, P.f1x * LS, P.f1y * LS, K.thigh, K.shin, -1);
  s.k1x = IKO[0]; s.k1y = IKO[1]; s.a1x = IKO[2]; s.a1y = IKO[3];
  ik(s.hp2x, s.hp2y, P.f2x * LS, P.f2y * LS, K.thigh, K.shin, -1);
  s.k2x = IKO[0]; s.k2y = IKO[1]; s.a2x = IKO[2]; s.a2y = IKO[3];
  const ha = P.lean * 0.4 + P.hd;
  s.ha = ha;
  const hl = K.neck + K.headR * 0.72;
  s.hx = s.nx + Math.sin(P.lean * 0.7 + P.hd * 0.4) * hl + s.fx * 0.9;
  s.hy = s.ny - Math.cos(P.lean * 0.7 + P.hd * 0.4) * hl + s.fy * 0.9;
}
// 몸 변환 T1(회전·가로배율·찌그러짐) → T0(발 중앙 로컬)
let TX = 0, TY = 0;
function tx0(P, x, y) {
  let X = x, Y = y;
  if (P.rot) { const pv = P.pvy * LS, c = Math.cos(P.rot), s = Math.sin(P.rot), dy = Y - pv; X = x * c - dy * s; Y = pv + x * s + dy * c; }
  TX = X * P.sx * (1 + (1 - P.sq) * 0.6) + P.ox; TY = Y * P.sq;
}
function applyT1(c, P) {
  if (P.ox) c.translate(P.ox, 0);
  c.scale(P.sx * (1 + (1 - P.sq) * 0.6), P.sq);
  if (P.rot) { c.translate(0, P.pvy * LS); c.rotate(P.rot); c.translate(0, -P.pvy * LS); }
}

// ───────────────────────── 체인(천·머리카락) ─────────────────────────
const CBUF = {};
function cbuf(key, n) { let b = CBUF[key]; if (!b || b.length < n * 2) b = CBUF[key] = new Float32Array(Math.max(n * 2, 32)); return b; }
/**
 * 베를레 체인 → T0 로컬 점 배열. rig 없으면(잔상) 속도 기반 정지 근사.
 * cfg: {g, d, push, rest, curl, flut}  lim: 몸 뒤쪽 한계 x (T0 로컬, 넘으면 밀어냄)
 */
function chain(key, E, ax, ay, n, seg, cfg, lim) {
  const out = cbuf(key, n);
  const { p, rig, hs, fac, dt, P } = E;
  const vx = (p.vx || 0) * fac, vy = p.vy || 0;
  if (rig) {
    const chs = rig.ch || (rig.ch = {});
    let ch = chs[key];
    if (!ch || ch.n !== n) { ch = chs[key] = new VerletChain(n, seg * hs, { gravity: cfg.g ?? 1400, damping: cfg.d ?? 0.92, iterations: 3 }); ch.fresh = 1; }
    ch.seg = seg * hs;
    const wx = p.cx + fac * hs * ax, wy = p.bottom + hs * ay;
    if (ch.fresh || Math.abs(wx - ch.lx) + Math.abs(wy - ch.ly) > 110 * hs) {
      const a = cfg.rest ?? 0.2;
      ch.reset(wx, wy, -fac * Math.sin(a), Math.cos(a)); ch.fresh = 0; ch.lx = wx; ch.ly = wy;
      // 새(또는 순간 이동한) 사슬은 쉬는 각도의 곧은 막대로 시작한다 → 메뉴·턴테이블 첫 프레임, 방 입장 직후 목도리·망토가
      // 막대처럼 뻗었다가 떨어진다. 제자리에서 미리 늘어뜨려(1/60초 × 36걸음, 바람 밀기·바닥·몸 뒤 한계 포함) 정지 상태로 시작
      const gy = p.onGround !== false ? p.bottom - 0.6 * hs : null, pf = -fac * (cfg.push ?? 0);
      const L = lim !== undefined && !P.rot && P.sx > 0.95 ? p.cx + fac * hs * lim : null;
      for (let k = 0; k < 36; k++) {
        ch.update(1 / 60, wx, wy, pf, 0, gy);
        if (L !== null) for (let i = 1; i < n; i++) { const q = ch.pts[i]; if ((q.x - L) * fac > 0) q.x = L; }
      }
      for (const q of ch.pts) { q.px = q.x; q.py = q.y; }
    } else if (ch.fac !== undefined && ch.fac !== fac) {
      // 방향 전환: 사슬 모양을 앵커 기준으로 거울 뒤집기 (옛 앵커 → 새 앵커). 뒤집지 않으면 몸 앞쪽에 남은 점들이
      // 뒤쪽 한계(lim)로 끌려가며 큰 속도를 얻어 망토·머리카락이 3~4프레임 수평·위로 휙 넘어간다 (heroes3rev §5.2).
      // 월드 속도는 60% 만 남긴다(달리던 관성으로 자연스럽게 뒤로 흐름). 이 프레임은 관성 전달을 건너뛴다.
      const m = ch.lx + wx;
      for (const q of ch.pts) { const v = (q.x - q.px) * 0.6; q.x = m - q.x; q.px = q.x - v; }
      ch.lx = wx; ch.ly = wy;
    }
    ch.fac = fac;
    // 관성 전달: 앵커 이동량의 일부를 체인 전체에 그대로 옮겨 (속도는 보존) 지나친 끌림을 줄인다.
    // 가로는 적게(달릴 때 뒤로 흩날림), 세로는 많이(낙하 중 천이 수직으로 솟는 현상 방지)
    if (dt > 0 && ch.lx !== undefined) {
      const kx = cfg.ix ?? 0.3, ky = cfg.iy ?? 0.72, mx0 = (wx - ch.lx) * kx, my0 = (wy - ch.ly) * ky;
      for (let i = 1; i < n; i++) { const q = ch.pts[i]; q.x += mx0; q.px += mx0; q.y += my0; q.py += my0; }
    }
    ch.lx = wx; ch.ly = wy;
    // 발 딛음 반동 (feel.md §3.3.2 'special'): feel_move 가 발이 닿을 때마다 p.feel.steps 를 올린다 → 자락·머리카락 끝에
    // 작은 위·뒤 방향 튕김 (끝으로 갈수록 크게). 잔상 스냅샷은 rig 가 없어 영향 없음
    const stp = p.feel?.steps;
    if (dt > 0 && stp !== undefined && ch.steps !== undefined && stp !== ch.steps) {
      const A = (cfg.step ?? 0.3) * hs;
      for (let i = 1; i < n; i++) { const q = ch.pts[i], k = A * (i / (n - 1)); q.py += k; q.px += fac * k * 0.4; }
    }
    ch.steps = stp;
    if (dt > 0) {
      const flut = cfg.flut ? Math.sin(G.t * 11 + n) * cfg.flut * (0.18 + Math.min(1, Math.abs(vx) / 260)) : 0;
      ch.update(dt, wx, wy, -fac * (cfg.push ?? 0), flut, p.onGround !== false ? p.bottom - 0.6 * hs : null);
      if (lim !== undefined && !P.rot && P.sx > 0.95) {
        const L = p.cx + fac * hs * lim;
        // 몸을 뚫고 앞으로 나간 점은 한계선으로 — 이전 위치도 선 너머면 선 위로 (한계선에서 되튀는 속도가 생기지 않게)
        for (let i = 1; i < n; i++) { const q = ch.pts[i]; if ((q.x - L) * fac > 0) { q.x = L; if ((q.px - L) * fac > 0) q.px = L; } }
      }
      if (cfg.flut) {
        const A = cfg.flut * 14 * (0.14 + Math.min(1.2, Math.abs(vx) / 260)) * dt * dt;
        for (let i = 2; i < n; i++) { const q = ch.pts[i]; q.y += Math.sin(G.t * 13 - i * 0.9) * A * (i / n); }
      }
      // cfg.up (망토): 점이 앵커(어깨)보다 up 이상 올라가지 않게 — 질주·대시 급정지나 뒤로 대시(방향 전환) 뒤 사슬이 채찍처럼
      // 휘돌아 머리 위로 깃발처럼 서는 현상 방지 (세라 달리기 → 뒤로 순간이동: 망토 끝이 12프레임 동안 어깨 위 ~180°).
      // 걸린 점은 위로 가던 속도를 버리고 가로 속도도 절반만 남긴다(넘어가려던 기세를 꺾음)
      if (cfg.up !== undefined) {
        const top = wy - cfg.up * hs;
        for (let i = 1; i < n; i++) { const q = ch.pts[i]; if (q.y < top) { q.y = top; if (q.py < top) q.py = top; q.px = q.x - (q.x - q.px) * 0.5; } }
      }
    }
    for (let i = 0; i < n; i++) { const q = ch.pts[i]; out[i * 2] = (q.x - p.cx) * fac / hs; out[i * 2 + 1] = (q.y - p.bottom) / hs; }
  } else {
    const a0 = clamp(vx * 0.0028, -0.5, 1.3) + (cfg.rest ?? 0.2) + clamp(vy * 0.0013, -0.3, 1.0);
    let x = ax, y = ay;
    out[0] = x; out[1] = y;
    for (let i = 1; i < n; i++) {
      const a = a0 + (cfg.curl ?? 0.05) * i * (vx > 60 ? 1 : 0.5);
      x -= Math.sin(a) * seg; y += Math.cos(a) * seg;
      if (y > -0.6 && p.onGround !== false) y = -0.6;
      if (cfg.up !== undefined && y < ay - cfg.up) y = ay - cfg.up;   // 잔상도 망토가 어깨 위로 서지 않게

      out[i * 2] = x; out[i * 2 + 1] = y;
    }
  }
  return out;
}

// 2차 운동(스프링): 코트 자락·장식끈 흔들림
function swingOf(E) {
  const { p, rig, dt, fac } = E;
  const vx = (p.vx || 0) * fac, vy = p.vy || 0;
  const tgt = clamp(vx * 0.032, -5, 11) + clamp(vy * 0.006, -3, 6);
  const tl = clamp(vy * 0.009, -4, 7) + clamp(Math.abs(vx) * 0.006, 0, 3);
  if (!rig) { SW.tr = tgt; SW.lift = tl; SW.fl = Math.sin(G.t * 9) * 0.5; return; }
  const sw = rig.sw || (rig.sw = { x: 0, v: 0, l: 0, lv: 0 });
  if (dt > 0) {
    sw.v += ((tgt - sw.x) * 170 - sw.v * 11) * dt; sw.x += sw.v * dt;
    sw.lv += ((tl - sw.l) * 150 - sw.lv * 10) * dt; sw.l += sw.lv * dt;
  }
  SW.tr = sw.x; SW.lift = sw.l; SW.fl = Math.sin(G.t * 9) * (0.3 + Math.min(1, Math.abs(vx) / 250));
}
const SW = { tr: 0, lift: 0, fl: 0 };

// ───────────────────────── 부위 그리기 ─────────────────────────
let QX = 0, QY = 0;
function sp(s, K, t, off) { QX = s.px + s.ux * K.torso * t + s.fx * off; QY = s.py + s.uy * K.torso * t + s.fy * off; }
const TPM = [-0.14, 5.0, 5.4, 0, 6.5, 7.0, 0.3, 6.0, 5.7, 0.62, 7.5, 6.5, 0.88, 6.9, 6.4, 1, 3.5, 3.7];
const TPF = [-0.14, 5.3, 6.0, 0, 6.7, 7.6, 0.32, 5.0, 4.9, 0.6, 7.9, 5.5, 0.86, 5.5, 5.4, 1, 3.0, 3.2];
const TB = new Float32Array(40);
function torsoPath(s, K, grow = 0, tMin = -1, tMax = 2) {
  const prof = K.fem ? TPF : TPM, n = prof.length / 3;
  let j = 0, m = 0;
  for (let i = 0; i < n; i++) { const t = clamp(prof[i * 3], tMin, tMax); sp(s, K, t, prof[i * 3 + 1] * K.hW + grow); TB[j++] = QX; TB[j++] = QY; m++; }
  for (let i = n - 1; i >= 0; i--) { const t = clamp(prof[i * 3], tMin, tMax); sp(s, K, t, -(prof[i * 3 + 2] * K.hW + grow)); TB[j++] = QX; TB[j++] = QY; m++; }
  smoothClosed(G.c, TB, m);
}
function frontAt(K, t) {
  const prof = K.fem ? TPF : TPM, n = prof.length / 3;
  for (let i = 1; i < n; i++) if (t <= prof[i * 3]) { const u = (t - prof[i * 3 - 3]) / (prof[i * 3] - prof[i * 3 - 3]); return lerp(prof[i * 3 - 2], prof[i * 3 + 1], u) * K.hW; }
  return prof[n * 3 - 2] * K.hW;
}
function backAt(K, t) {
  const prof = K.fem ? TPF : TPM, n = prof.length / 3;
  for (let i = 1; i < n; i++) if (t <= prof[i * 3]) { const u = (t - prof[i * 3 - 3]) / (prof[i * 3] - prof[i * 3 - 3]); return lerp(prof[i * 3 - 1], prof[i * 3 + 2], u) * K.hW; }
  return prof[n * 3 - 1] * K.hW;
}
/** 몸통의 한 띠(t0~t1) 앞/뒤 폭 비율로 경로 */
function bandPath(s, K, t0, t1, fr0 = 1, fr1 = 1, bk0 = 1, bk1 = 1, grow = 0.3) {
  const c = G.c;
  c.beginPath();
  sp(s, K, t0, frontAt(K, t0) * fr0 + grow); c.moveTo(QX, QY);
  sp(s, K, t1, frontAt(K, t1) * fr1 + grow); c.lineTo(QX, QY);
  sp(s, K, t1, -(backAt(K, t1) * bk1 + grow)); c.lineTo(QX, QY);
  sp(s, K, t0, -(backAt(K, t0) * bk0 + grow)); c.lineTo(QX, QY);
  c.closePath();
}

function drawFoot(x, y, ang, base, bw, low) {
  const c = G.c;
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(bw, bw);
  c.beginPath();
  c.moveTo(-2.4, -2.6); c.lineTo(-3.0, 2.6); c.lineTo(6.8, 2.7); c.quadraticCurveTo(8.8, 2.6, 8.4, 0.9);
  c.quadraticCurveTo(7.6, -0.6, 4.6, -1.2); c.quadraticCurveTo(2.6, -2.4, 2.2, -3.2); c.closePath();
  if (G.pass !== 1) c.fillStyle = grad(0, -3, 0, 3, base, 1);
  fl(); outline(base);
  if (!G.tint && G.pass !== 1) { c.fillStyle = sh(base, -0.5); c.fillRect(-3, 1.9, 10.2, 0.9); if (!low) { c.fillStyle = ra(sh(base, 0.5), 0.5); c.fillRect(0.5, -1.6, 4, 0.5); } }
  c.restore();
}
function drawLeg(s, K, near) {
  const d = near ? 0 : -0.3, bw = K.limb;
  const hx = near ? s.hp1x : s.hp2x, hy = near ? s.hp1y : s.hp2y, kx = near ? s.k1x : s.k2x, ky = near ? s.k1y : s.k2y;
  const ax = near ? s.a1x : s.a2x, ay = near ? s.a1y : s.a2y;
  const pants = sh(K.pants, d), boot = sh(K.heavy ? K.ac : K.boots, d);
  const skirtLeg = K.o === 'lady' || K.o === 'girl' || K.o === 'innkeeper';
  capsule(hx, hy, kx, ky, 4.9 * bw, 3.6 * bw, pants);
  if (K.heavy) {
    capsule(kx, ky, ax, ay, 3.8 * bw, 2.9 * bw, boot);
    ellipse(kx + 0.6, ky, 3.2 * bw, 2.8 * bw);
    if (G.pass !== 1) G.c.fillStyle = grad(kx - 3, ky - 3, kx + 3, ky + 3, sh(K.ac, d + 0.08));
    fl(); outline(K.ac);
  } else if (K.tall) {
    capsule(kx, ky, ax, ay, 3.6 * bw, 2.7 * bw, boot);
    if (G.pass !== 1) {
      const cx = lerp(kx, ax, 0.1), cy = lerp(ky, ay, 0.1);
      const nx = (ay - ky), ny = -(ax - kx), nd = Math.hypot(nx, ny) || 1;
      capsule(cx + (nx / nd) * 3.3 * bw, cy + (ny / nd) * 3.3 * bw, cx - (nx / nd) * 3.5 * bw, cy - (ny / nd) * 3.5 * bw, 1.25 * bw, 1.25 * bw, sh(boot, 0.16));
    }
    if (K.o === 'ninja') { // 정강이 보호대 + 무릎
      capsule(lerp(kx, ax, 0.14), lerp(ky, ay, 0.14), lerp(kx, ax, 0.72), lerp(ky, ay, 0.72), 2.7 * bw, 2.1 * bw, sh('#5e5c6e', d), 1.3);
      ellipse(kx + 0.4, ky, 2.4 * bw, 2.2 * bw);
      if (G.pass !== 1) G.c.fillStyle = grad(kx - 2, ky - 2, kx + 2, ky + 2, sh('#6e6c7e', d));
      fl(); outline('#6e6c7e');
    }
  } else {
    capsule(kx, ky, ax, ay, 3.4 * bw, 2.5 * bw, skirtLeg ? sh(mx(K.skin, '#e8e0e0', 0.4), d) : pants);
  }
  drawFoot(ax, ay, near ? LEG_T1 : LEG_T2, K.tall || K.heavy ? boot : sh(K.boots, d), bw * (K.kid ? 0.85 : 1), !K.tall);
}
let LEG_T1 = 0, LEG_T2 = 0;

function drawArm(s, K, near) {
  const d = near ? 0 : -0.3, bw = K.limb;
  const sx = near ? s.s1x : s.s2x, sy = near ? s.s1y : s.s2y, ex = near ? s.e1x : s.e2x, ey = near ? s.e1y : s.e2y;
  const hx = near ? s.h1x : s.h2x, hy = near ? s.h1y : s.h2y;
  capsule(sx, sy, ex, ey, (K.fem ? 3.4 : 4.1) * bw * K.hW, 2.8 * bw, sh(K.sleeve, d));
  // 팔뚝: 손목 조금 앞까지
  const wx = lerp(ex, hx, 0.86), wy = lerp(ey, hy, 0.86);
  capsule(ex, ey, wx, wy, 3.0 * bw, 2.3 * bw, sh(K.fore, d));
  if (K.o === 'ninja') capsule(lerp(ex, hx, 0.3), lerp(ey, hy, 0.3), lerp(ex, hx, 0.8), lerp(ey, hy, 0.8), 2.55 * bw, 2.2 * bw, sh('#6e6c7e', d), 1.3); // 쇠 팔 보호대
  const c = G.c;
  if (!G.tint && G.pass !== 1) {
    // 소맷부리
    const cx = lerp(ex, hx, 0.72), cy = lerp(ey, hy, 0.72), dx = hx - ex, dy = hy - ey, dd = Math.hypot(dx, dy) || 1;
    if (K.o === 'nun' || K.o === 'priest' || K.o === 'lady') {
      c.beginPath(); c.moveTo(cx - (dy / dd) * 3.4, cy + (dx / dd) * 3.4); c.lineTo(cx + (dx / dd) * 3.2 - (dy / dd) * 4.6, cy + (dy / dd) * 3.2 + (dx / dd) * 4.6);
      c.lineTo(cx + (dx / dd) * 3.2 + (dy / dd) * 4.6, cy + (dy / dd) * 3.2 - (dx / dd) * 4.6); c.lineTo(cx + (dy / dd) * 3.4, cy - (dx / dd) * 3.4); c.closePath();
      c.fillStyle = sh(K.sleeve, d - 0.05); c.fill(); outline(K.sleeve, 0.6);
      c.strokeStyle = sh(K.cuff, d); c.lineWidth = 0.9; c.stroke();
    } else if (!K.heavy && K.o !== 'smith' && K.fore !== K.skin) {
      c.strokeStyle = sh(K.o === 'ninja' ? K.tr : K.o === 'hunter' || K.o === 'noble' ? K.se : K.cuff, d - 0.1); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(cx - (dy / dd) * 2.7, cy + (dx / dd) * 2.7); c.lineTo(cx + (dy / dd) * 2.7, cy - (dx / dd) * 2.7); c.stroke();
    }
    if (K.o === 'ninja') { // 팔 붕대 감기
      c.strokeStyle = ra(sh(K.se, 0.3 + d), 0.8); c.lineWidth = 0.55; c.beginPath();
      for (let i = 1; i < 5; i++) { const u = i / 5, px = lerp(ex, wx, u), py = lerp(ey, wy, u); c.moveTo(px - (dy / dd) * 2.6, py + (dx / dd) * 2.6); c.lineTo(px + (dx / dd) * 1.2 + (dy / dd) * 2.6, py + (dy / dd) * 1.2 - (dx / dd) * 2.6); }
      c.stroke();
    }
    if (K.heavy) { // 건틀릿 테
      c.strokeStyle = sh(K.at, d); c.lineWidth = 0.9; c.beginPath(); c.moveTo(cx - (dy / dd) * 3.3, cy + (dx / dd) * 3.3); c.lineTo(cx + (dy / dd) * 3.3, cy - (dx / dd) * 3.3); c.stroke();
    }
    if (K.runes) runeLine(ex, ey, wx, wy, d);
  }
}
function drawHand(s, K, near) {
  const d = near ? 0 : -0.3, bw = K.limb;
  const hx = near ? s.h1x : s.h2x, hy = near ? s.h1y : s.h2y, ex = near ? s.e1x : s.e2x, ey = near ? s.e1y : s.e2y;
  const a = Math.atan2(hy - ey, hx - ex);
  const c = G.c;
  c.save(); c.translate(hx, hy); c.rotate(a);
  ellipse(0.4, 0, 2.9 * bw, 2.5 * bw);
  const gc = sh(K.glove, d);
  c.fillStyle = grad(0, -3, 0, 3, gc); c.fill(); outline(gc);
  if (!G.tint) { c.strokeStyle = ra(sh(gc, -0.5), 0.6); c.lineWidth = 0.4; c.beginPath(); c.moveTo(1.6, -1.8); c.lineTo(1.9, 1.8); c.stroke(); }
  c.restore();
}
function runeLine(x0, y0, x1, y1, d) {
  if (G.tint || !G.fx) return;
  const c = G.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.strokeStyle = ra('#ff2a3a', 0.75 + 0.25 * Math.sin(G.t * 5) + d); c.lineWidth = 0.6;
  c.beginPath();
  for (let i = 0; i <= 4; i++) { const u = i / 4, x = lerp(x0, x1, u), y = lerp(y0, y1, u); if (i) c.lineTo(x + (i % 2 ? 1 : -1), y); else c.moveTo(x, y); }
  c.stroke(); c.restore();
}

function drawPauldron(s, K, near) {
  if (!K.armor || K.armor === 'chain') return;
  const c = G.c, d = near ? 0 : -0.3, big = K.heavy ? 1 : 0.7;
  const x = near ? s.s1x : s.s2x, y = near ? s.s1y : s.s2y;
  const a = Math.atan2((near ? s.e1y : s.e2y) - y, (near ? s.e1x : s.e2x) - x);
  c.save(); c.translate(x, y); c.rotate(a - HP * 0.6); c.scale(big * K.hW, big * K.hW);
  const base = sh(K.ac, d);
  const n = K.heavy ? 3 : 1;
  for (let i = n - 1; i >= 0; i--) {
    c.beginPath(); c.ellipse(-0.5 + i * 1.2, 1 + i * 2.3, 6.4 - i * 0.7, 4.3 - i * 0.5, 0.2, PI * 1.02, PI * 2.05); c.closePath();
    c.fillStyle = grad(-6, -4, 6, 4, sh(base, -i * 0.06)); c.fill(); outline(base);
  }
  if (!G.tint) {
    c.strokeStyle = sh(K.at, d); c.lineWidth = 0.8; c.beginPath(); c.ellipse(-0.5, 1, 6.4, 4.3, 0.2, PI * 1.05, PI * 2.0); c.stroke();
    if (K.armor === 'dark') { c.fillStyle = sh('#d8d0c8', d); for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-4 + i * 3.4, -2.8 + Math.abs(i - 1) * 0.8); c.lineTo(-3 + i * 3.4, -8.5 + Math.abs(i - 1) * 1.5); c.lineTo(-1.8 + i * 3.4, -2.6 + Math.abs(i - 1) * 0.8); c.fill(); } }
  }
  c.restore();
}

// ── 몸통 ──
function drawTorso(s, K, E) {
  const c = G.c;
  torsoPath(s, K);
  sp(s, K, 0.55, 0); const mx0 = QX, my0 = QY;
  c.fillStyle = grad(mx0 - s.fx * 8, my0 - s.fy * 8, mx0 + s.fx * 8, my0 + s.fy * 8, K.torsoC); c.fill(); outline(K.torsoC);
  if (G.tint) return;
  const o = K.o;
  // 앞섶(열린 코트 안쪽 조끼/셔츠)
  if (o === 'hunter' || o === 'gunslinger' || o === 'noble' || o === 'merchant') {
    const vest = o === 'noble' ? K.se : o === 'gunslinger' ? K.se : o === 'merchant' ? K.se : K.se;
    c.beginPath();
    sp(s, K, 0.02, frontAt(K, 0.02) + 0.2); c.moveTo(QX, QY);
    for (let t = 0.1; t <= 0.96; t += 0.12) { sp(s, K, t, frontAt(K, t) + 0.2); c.lineTo(QX, QY); }
    for (let t = 0.96; t >= 0.02; t -= 0.12) { sp(s, K, t, frontAt(K, t) - (o === 'noble' ? 2.4 : 3.3) - (t > 0.8 ? 1.2 : 0)); c.lineTo(QX, QY); }
    c.closePath(); c.fillStyle = grad(mx0, my0, mx0 + s.fx * 8, my0 + s.fy * 8, vest, 0.8); c.fill(); outline(vest, 0.6);
    // 단추/라펠 선
    c.fillStyle = o === 'noble' ? '#e8c872' : sh(K.tr, -0.2);
    if (o !== 'hunter') for (let t = 0.24; t < 0.8; t += 0.18) { sp(s, K, t, frontAt(K, t) - 1.5); c.beginPath(); c.arc(QX, QY, 0.42, 0, TAU); c.fill(); }
    c.strokeStyle = K.tr; c.lineWidth = o === 'noble' ? 0.9 : 0.6; c.beginPath();
    for (let t = 0.02; t <= 0.98; t += 0.12) { sp(s, K, t, frontAt(K, t) - (o === 'noble' ? 2.6 : 3.4) - (t > 0.8 ? 1.2 : 0)); if (t === 0.02) c.moveTo(QX, QY); else c.lineTo(QX, QY); }
    c.stroke();
  }
  if (o === 'hunter') { // 대각 탄띠 + 은 장식
    c.lineCap = 'butt'; c.strokeStyle = '#2a1812'; c.lineWidth = 2.2;
    sp(s, K, 0.95, -backAt(K, 0.95) * 0.7); const bx = QX, by = QY; sp(s, K, 0.12, frontAt(K, 0.12) * 0.8); const fx = QX, fy = QY;
    c.beginPath(); c.moveTo(bx, by); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = '#c8ccd4'; for (let u = 0.25; u < 0.9; u += 0.22) { c.beginPath(); c.arc(lerp(bx, fx, u), lerp(by, fy, u), 0.7, 0, TAU); c.fill(); }
  }
  if (o === 'nun') { // 앞 패널 + 금십자
    bandPath(s, K, -0.1, 0.9, 0.95, 0.8, -0.1, -0.1, 0.2);
    c.fillStyle = grad(mx0, my0, mx0 + s.fx * 7, my0 + s.fy * 7, K.se, 0.8); c.fill();
    sp(s, K, 0.62, frontAt(K, 0.62) * 0.45);
    c.fillStyle = K.tr; c.fillRect(QX - 0.6, QY - 3, 1.2, 6); c.fillRect(QX - 2, QY - 1.6, 4, 1.1);
    glow(QX, QY, 6, '#fff2b0', 0.35);
  }
  if (o === 'priest') { // 영대(스톨)
    c.strokeStyle = K.se; c.lineWidth = 2.2; c.beginPath(); sp(s, K, 0.98, 1.2); c.moveTo(QX, QY); sp(s, K, 0.3, frontAt(K, 0.3) - 1); c.lineTo(QX, QY); c.lineTo(QX + 0.5, QY + 16); c.stroke();
    c.fillStyle = '#e8c872'; sp(s, K, 0.62, frontAt(K, 0.62) - 0.2); c.fillRect(QX - 0.5, QY - 2, 1, 4.5); c.fillRect(QX - 1.6, QY - 0.9, 3.2, 1);
  }
  if (o === 'ninja') { // 가슴 보호대
    bandPath(s, K, 0.5, 0.86, 0.85, 0.8, 0.3, 0.3, 0.35);
    c.fillStyle = grad(mx0, my0 - 4, mx0 + s.fx * 6, my0, sh(K.tr, -0.35)); c.fill(); outline(K.tr, 0.6);
  }
  if (o === 'smith' || o === 'innkeeper' || o === 'girl') { // 앞치마 윗단
    const ap = o === 'smith' ? K.se : '#e8e2d6';
    bandPath(s, K, 0.05, o === 'smith' ? 0.8 : 0.62, 1.02, 0.9, -0.2, -0.2, 0.35);
    c.fillStyle = grad(mx0, my0, mx0 + s.fx * 7, my0 + s.fy * 7, ap, 0.7); c.fill(); outline(ap, 0.6);
  }
  if (o === 'lady' || o === 'innkeeper') { // 코르셋
    bandPath(s, K, 0.1, 0.55, 1.03, 0.98, 1.02, 1.0, 0.3);
    c.fillStyle = grad(mx0 - s.fx * 7, my0, mx0 + s.fx * 7, my0, K.se, 0.8); c.fill(); outline(K.se, 0.6);
    c.strokeStyle = ra(K.tr, 0.8); c.lineWidth = 0.4; c.beginPath();
    for (let t = 0.15; t < 0.52; t += 0.08) { sp(s, K, t, frontAt(K, t) - 0.3); c.moveTo(QX, QY); sp(s, K, t + 0.04, frontAt(K, t) - 1.8); c.lineTo(QX, QY); }
    c.stroke();
  }
  if (o === 'lady') { // 파인 목선
    c.beginPath(); sp(s, K, 0.98, 1.6); c.moveTo(QX, QY); sp(s, K, 0.78, frontAt(K, 0.78) + 0.1); c.quadraticCurveTo(QX - s.fx * 2, QY - 1, QX, QY); sp(s, K, 0.9, frontAt(K, 0.9)); c.lineTo(QX, QY); c.closePath();
    c.fillStyle = K.skin; c.fill();
  }
  // 갑옷
  if (K.armor) drawArmorChest(s, K, mx0, my0);
  if (o === 'knight' || (K.heavy && o !== 'nun')) { // 휘장(타바드) 윗부분
    if (o === 'knight') {
      bandPath(s, K, 0.02, 0.94, 0.98, 0.75, -0.25, -0.2, 0.45);
      c.fillStyle = grad(mx0, my0, mx0 + s.fx * 8, my0 + s.fy * 8, K.pr, 0.9); c.fill(); outline(K.pr, 0.7);
      c.strokeStyle = K.tr; c.lineWidth = 0.7; c.beginPath(); sp(s, K, 0.02, -0.25 * backAt(K, 0.02) - 0.45); c.moveTo(QX, QY); sp(s, K, 0.94, -0.2 * backAt(K, 0.94) - 0.45); c.lineTo(QX, QY); c.stroke();
      // 문장(십자)
      sp(s, K, 0.6, frontAt(K, 0.6) * 0.4); c.fillStyle = K.tr; c.fillRect(QX - 0.7, QY - 3.2, 1.4, 6.4); c.fillRect(QX - 2.4, QY - 1.4, 4.8, 1.3);
    }
  }
  // 허리띠
  bandPath(s, K, 0.1, 0.2, 1, 1, 1, 1, 0.45);
  c.fillStyle = grad(mx0, my0 - 3, mx0, my0 + 3, K.belt, 0.7); c.fill(); outline(K.belt, 0.6);
  sp(s, K, 0.15, frontAt(K, 0.15) + 0.2);
  c.fillStyle = K.o === 'hunter' ? '#c8ccd4' : K.tr; c.fillRect(QX - 1.8, QY - 1.4, 2.4, 2.8);
  if (K.o === 'hunter') { c.fillStyle = '#e8ecf4'; c.fillRect(QX - 1.1, QY - 1.2, 0.9, 2.4); }
  if (K.o === 'gunslinger') { // 탄띠(낮게)
    bandPath(s, K, -0.08, 0.02, 1.05, 1.05, 1.05, 1.05, 0.4); c.fillStyle = '#4a2a18'; c.fill(); outline('#4a2a18', 0.5);
    c.fillStyle = '#d8b060'; for (let u = -0.6; u < 0.9; u += 0.3) { sp(s, K, -0.03, u * 6); c.fillRect(QX - 0.4, QY - 1, 0.8, 1.8); }
  }
  if (K.o === 'ninja') { // 허리 매듭
    sp(s, K, 0.15, -backAt(K, 0.15) - 0.5); ellipse(QX, QY, 1.8, 1.5); c.fillStyle = sh(K.se, 0.1); c.fill(); outline(K.se, 0.5);
  }
  if (K.runes) { sp(s, K, 0.75, frontAt(K, 0.75) * 0.3); const x0 = QX, y0 = QY; sp(s, K, 0.35, frontAt(K, 0.35) * 0.1); runeLine(x0, y0, QX, QY, 0); }
  void E;
}
function drawArmorChest(s, K, mx0, my0) {
  const c = G.c, a = K.armor;
  if (a === 'chain') {
    bandPath(s, K, -0.05, 0.92, 1.02, 1.02, 1.02, 1.02, 0.25);
    c.fillStyle = grad(mx0 - s.fx * 8, my0, mx0 + s.fx * 8, my0, K.ac, 0.8); c.fill(); outline(K.ac, 0.6);
    c.save(); c.clip();
    c.strokeStyle = ra(sh(K.ac, -0.45), 0.55); c.lineWidth = 0.45;
    for (let t = -0.05; t < 0.95; t += 0.07) { c.beginPath(); for (let f = -8; f < 9; f += 1.6) { sp(s, K, t, f); c.moveTo(QX + 0.7, QY); c.arc(QX, QY, 0.7, 0, PI); } c.stroke(); }
    c.restore();
    return;
  }
  if (a === 'leather') {
    bandPath(s, K, 0.28, 0.92, 1.06, 1.04, 0.9, 0.9, 0.35);
    c.fillStyle = grad(mx0 - s.fx * 8, my0, mx0 + s.fx * 8, my0, K.ac, 0.9); c.fill(); outline(K.ac, 0.7);
    c.setLineDash([0.8, 0.8]); c.strokeStyle = ra(K.at, 0.8); c.lineWidth = 0.4;
    bandPath(s, K, 0.32, 0.88, 0.94, 0.92, 0.8, 0.8, -0.4); c.stroke(); c.setLineDash([]);
    return;
  }
  // 판금(plate/holy/dark): 흉갑 + 허리 판
  const ac = K.ac;
  c.beginPath();
  sp(s, K, 0.3, frontAt(K, 0.3) + 0.6); c.moveTo(QX, QY);
  sp(s, K, 0.62, frontAt(K, 0.62) + 1.4); const cx1 = QX, cy1 = QY;
  sp(s, K, 0.95, frontAt(K, 0.95) + 0.6); c.quadraticCurveTo(cx1, cy1, QX, QY);
  sp(s, K, 1.0, -backAt(K, 1.0) - 0.4); c.lineTo(QX, QY);
  sp(s, K, 0.6, -backAt(K, 0.6) - 0.8); c.lineTo(QX, QY);
  sp(s, K, 0.3, -backAt(K, 0.3) - 0.5); c.lineTo(QX, QY);
  c.closePath();
  c.fillStyle = grad(mx0 - s.fx * 9, my0, mx0 + s.fx * 9, my0, ac, 1.1); c.fill(); outline(ac, 0.8);
  c.strokeStyle = K.at; c.lineWidth = 0.8; c.stroke();
  // 능선 하이라이트
  c.strokeStyle = ra('#ffffff', 0.5); c.lineWidth = 0.6; c.beginPath(); sp(s, K, 0.35, frontAt(K, 0.35) * 0.3); c.moveTo(QX, QY); sp(s, K, 0.9, frontAt(K, 0.9) * 0.5); c.lineTo(QX, QY); c.stroke();
  // 허리 판(fauld)
  for (let i = 0; i < 2; i++) {
    bandPath(s, K, 0.02 + i * 0.12, 0.14 + i * 0.12, 1.08, 1.06, 1.04, 1.02, 0.6);
    c.fillStyle = grad(mx0 - s.fx * 8, my0, mx0 + s.fx * 8, my0, sh(ac, -0.1 + i * 0.05)); c.fill(); outline(ac, 0.6);
  }
  if (a === 'holy') { sp(s, K, 0.66, frontAt(K, 0.66) * 0.55); c.fillStyle = '#e8c872'; c.fillRect(QX - 0.7, QY - 3, 1.4, 6); c.fillRect(QX - 2.2, QY - 1.3, 4.4, 1.2); glow(QX, QY, 7, '#fff2b0', 0.4); }
  if (a === 'dark' && G.fx) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra(K.at, 0.7 + 0.3 * Math.sin(G.t * 4)); c.lineWidth = 0.6;
    c.beginPath(); sp(s, K, 0.4, frontAt(K, 0.4) * 0.5); c.moveTo(QX, QY); sp(s, K, 0.6, frontAt(K, 0.6) * 0.9); c.lineTo(QX, QY); sp(s, K, 0.85, frontAt(K, 0.85) * 0.4); c.lineTo(QX, QY); c.stroke(); c.restore();
  }
}

// ── 코트·로브·치마 자락 ──
function legXAt(hx, hy, kx, ky, ax, ay, y) {
  if (y <= ky) { const u = clamp((y - hy) / ((ky - hy) || 1), 0, 1); return lerp(hx, kx, u); }
  const u = clamp((y - ky) / ((ay - ky) || 1), 0, 1); return lerp(kx, ax, u);
}
const HEM = { long: 28, robe: 37.5, dress: 36, short: 10, none: 0 };
function coatGeom(s, K, P) {
  const drop = HEM[K.coat] ?? 0;
  const hemY = Math.min(-0.8, s.py + drop - SW.lift * 0.35);
  const flare = K.coat === 'dress' ? 5 : K.coat === 'robe' ? 3.2 : 1.6;
  return { hemY, flare, drop };
}
function drawSkirt(s, K, P, near) {
  if (K.coat === 'none' || !HEM[K.coat]) return;
  const c = G.c;
  let { hemY, flare } = coatGeom(s, K, P);
  const d = near ? 0 : -0.32;
  sp(s, K, 0.22, frontAt(K, 0.22) + 0.3); const wfx = QX, wfy = QY;
  sp(s, K, 0.22, -backAt(K, 0.22) - 0.3); const wbx = QX, wby = QY;
  const legx = near ? legXAt(s.hp1x, s.hp1y, s.k1x, s.k1y, s.a1x, s.a1y, hemY) : legXAt(s.hp2x, s.hp2y, s.k2x, s.k2y, s.a2x, s.a2y, hemY);
  const other = near ? legXAt(s.hp2x, s.hp2y, s.k2x, s.k2y, s.a2x, s.a2y, hemY) : legXAt(s.hp1x, s.hp1y, s.k1x, s.k1y, s.a1x, s.a1y, hemY);
  const short = K.coat === 'short';
  const open = K.coat === 'long';
  let hfx = Math.max(legx + 4.5 + flare * 0.5, wfx + (short ? 1.5 : 0.5));
  if (short) hfx = wfx + 1.2 + flare;
  const back = Math.min(wbx, Math.min(legx, other) - 4.5) - flare - SW.tr * (short ? 0.3 : 1) - (open ? 3 : 1);
  const tailLift = SW.tr * (short ? 0.1 : 0.35) + SW.lift * 0.5 - (open ? 3 : 0);
  const hby = Math.min(-0.5, hemY - tailLift);
  if (open) hemY -= 2.5;
  const midx = lerp(hfx, back, 0.5), midy = Math.min(-0.5, hemY + 0.8 + SW.fl * 0.6);
  c.beginPath();
  c.moveTo(wfx, wfy);
  c.quadraticCurveTo(lerp(wfx, hfx, 0.5) + (short ? 0.5 : 1.5), lerp(wfy, hemY, 0.55), hfx, hemY);
  if (K.coat === 'dress' || K.coat === 'robe') { c.quadraticCurveTo(lerp(hfx, midx, 0.5), hemY + 1.2, midx, midy); c.quadraticCurveTo(lerp(midx, back, 0.5), midy + 0.6, back, hby); }
  else { c.lineTo(midx + 2, midy); c.lineTo(midx - 1, midy - 1.8); c.lineTo(back, hby); }
  c.quadraticCurveTo(lerp(back, wbx, 0.4) - 1.5, lerp(hby, wby, 0.5), wbx, wby);
  c.closePath();
  let base = near ? K.pr : (open ? sh(K.lining, -0.15) : sh(K.pr, d));
  if (K.o === 'knight') base = near ? K.ac : sh(K.ac, d);
  if (K.o === 'smith' || K.o === 'innkeeper' || K.o === 'girl') base = sh(K.pr, d);
  const cx = (wfx + back) / 2, cy = (wfy + hemY) / 2;
  c.fillStyle = grad(back, cy, hfx, cy, base, 0.9); c.fill(); outline(base, 0.8);
  if (G.tint) return;
  if (near) {
    // 옷 주름
    c.strokeStyle = ra(sh(base, -0.45), 0.55); c.lineWidth = 0.6; c.beginPath();
    for (let i = 1; i <= 3; i++) { const u = i / 4; c.moveTo(lerp(wfx, wbx, u), lerp(wfy, wby, u) + 2); c.quadraticCurveTo(lerp(hfx, back, u) + SW.fl, lerp(hemY, hby, u) - 6, lerp(hfx, back, u) + 0.5, lerp(hemY, hby, u) - 0.5); }
    c.stroke();
    // 앞단/밑단 트림
    c.strokeStyle = K.o === 'knight' ? K.at : K.o === 'hunter' ? sh(K.tr, -0.25) : K.tr; c.lineWidth = K.coat === 'dress' ? 1.1 : 0.65;
    c.beginPath(); c.moveTo(hfx, hemY); c.quadraticCurveTo(lerp(hfx, midx, 0.5), hemY + 1, midx, midy);
    if (K.coat === 'dress' || K.coat === 'robe') c.quadraticCurveTo(lerp(midx, back, 0.5), midy + 0.6, back, hby); else { c.lineTo(midx - 1, midy - 1.8); c.lineTo(back, hby); }
    c.stroke();
    if (open) { // 안감이 보이는 앞자락
      c.strokeStyle = K.lining; c.lineWidth = 1.3; c.beginPath(); c.moveTo(wfx - 0.4, wfy + 1); c.quadraticCurveTo(lerp(wfx, hfx, 0.5) + 0.6, lerp(wfy, hemY, 0.55), hfx - 0.6, hemY - 0.4); c.stroke();
    }
    if (K.o === 'smith' || K.o === 'innkeeper' || K.o === 'girl') { // 앞치마 아랫단
      const ap = K.o === 'smith' ? K.se : '#e8e2d6';
      c.beginPath(); c.moveTo(wfx, wfy); c.lineTo(hfx + 0.4, hemY - (K.o === 'smith' ? 0 : 5)); c.lineTo(lerp(hfx, back, 0.45), hemY - (K.o === 'smith' ? 0 : 5)); c.lineTo(lerp(wfx, wbx, 0.45), wfy + 0.5); c.closePath();
      c.fillStyle = grad(lerp(wfx, wbx, 0.5), wfy, wfx, wfy, ap, 0.6); c.fill(); outline(ap, 0.5);
    }
  }
}
function drawTabard(s, K) {
  if (K.o !== 'knight') return;
  const c = G.c;
  const { hemY } = coatGeom(s, K, null);
  sp(s, K, 0.12, frontAt(K, 0.12) * 0.98); const x0 = QX, y0 = QY;
  sp(s, K, 0.12, -backAt(K, 0.12) * 0.25); const x1 = QX, y1 = QY;
  const kx = s.k1x, ky = s.k1y;
  const by = Math.min(ky + 3, -3);
  const lx = legXAt(s.hp1x, s.hp1y, s.k1x, s.k1y, s.a1x, s.a1y, by);
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(lx + 5, lerp(y0, by, 0.5), lx + 4 - SW.tr * 0.2, by); c.lineTo(lx - 4.5 - SW.tr * 0.4, by - SW.tr * 0.15); c.quadraticCurveTo(lx - 3.5, lerp(y1, by, 0.4), x1, y1); c.closePath();
  c.fillStyle = grad(lx - 5, by, lx + 5, by, K.pr, 0.9); c.fill(); outline(K.pr, 0.7);
  if (!G.tint) { c.strokeStyle = K.tr; c.lineWidth = 0.8; c.beginPath(); c.moveTo(lx + 4 - SW.tr * 0.2, by); c.lineTo(lx - 4.5 - SW.tr * 0.4, by - SW.tr * 0.15); c.stroke(); }
  void hemY; void kx;
}
function drawSash(s, K) {
  if (K.o !== 'ninja') return;
  const c = G.c;
  sp(s, K, 0.15, -backAt(K, 0.15) - 0.5); const x = QX, y = QY;
  for (let i = 0; i < 2; i++) {
    const len = 13 - i * 3, a = 0.35 + SW.tr * 0.09 + i * 0.25 + Math.sin(G.t * 6 + i) * 0.08;
    const ex = x - Math.sin(a) * len, ey = y + Math.cos(a) * len;
    c.beginPath(); c.moveTo(x, y - 1); c.quadraticCurveTo(lerp(x, ex, 0.5) - 1.5, lerp(y, ey, 0.5), ex, ey); c.lineTo(ex + 1.6, ey + 0.4); c.quadraticCurveTo(lerp(x, ex, 0.5) + 1, lerp(y, ey, 0.5), x + 1.2, y + 1);
    c.fillStyle = F(sh(K.se, -i * 0.15)); c.fill(); outline(K.se, 0.5);
  }
}

// ── 머리 ──
const HEAD_M = [-6.3, -1.2, -5.4, -5.6, -1.6, -7.7, 3.2, -6.8, 5.9, -3.8, 6.4, -1.0, 7.2, 1.4, 6.1, 2.5, 6.2, 3.9, 5.2, 5.8, 3.0, 6.9, -0.8, 6.0, -3.9, 3.8, -5.9, 1.8];
const HEAD_F = [-6.1, -1.2, -5.3, -5.6, -1.6, -7.6, 3.0, -6.7, 5.7, -3.8, 6.1, -1.0, 6.6, 1.2, 5.8, 2.3, 5.7, 3.5, 4.5, 5.3, 2.5, 6.2, -0.9, 5.4, -3.8, 3.5, -5.8, 1.8];
function drawNeck(s, K) {
  const bx = s.nx + s.fx * 0.6, by = s.ny + s.fy * 0.6;
  const hx = s.hx + Math.sin(s.ha) * 3.5 - 0.6, hy = s.hy + Math.cos(s.ha) * 3.5;
  capsule(bx, by, hx, hy, 2.8 * K.hW * (K.fem ? 0.85 : 1), 2.5 * (K.fem ? 0.85 : 1), sh(K.skin, -0.12));
}
function hairCapPath(c, style) {
  // 머리카락 덩어리: 뒤통수·목덜미 가닥 끝이 뾰족한 실루엣
  const slick = style === 'ponytail' || style === 'braid';
  c.beginPath();
  c.moveTo(6.7, -3.0);
  c.quadraticCurveTo(7.0, -7.8, 2.4, -9.1);
  c.quadraticCurveTo(-3.2, -10.3, -6.4, -7.0);
  c.quadraticCurveTo(-8.8, -4.0, -8.0, -0.4);
  if (slick) { c.quadraticCurveTo(-7.6, 2.4, -5.6, 2.6); c.lineTo(-4.4, 1.4); }
  else {
    c.lineTo(-9.0, 2.6); c.lineTo(-6.8, 1.4); c.lineTo(-7.2, 4.4); c.lineTo(-5.2, 2.4); c.lineTo(-4.6, 3.6);
  }
  c.quadraticCurveTo(-3.2, 0.6, -1.4, -1.0);
  c.lineTo(-0.5, 1.6); c.lineTo(0.5, -1.4);
  c.quadraticCurveTo(1.8, -2.6, 2.8, -2.6);
  if (style === 'bob' || style === 'long' || style === 'flowing') { c.lineTo(3.6, -1.0); c.lineTo(4.4, -2.4); c.lineTo(5.6, -0.6); c.lineTo(5.7, -2.3); c.lineTo(7.0, -1.4); }
  else if (!slick) { c.lineTo(3.4, -0.6); c.lineTo(4.3, -2.3); c.lineTo(6.2, -0.4); c.lineTo(6.0, -2.2); c.lineTo(7.5, -1.8); }
  else { c.quadraticCurveTo(4.6, -3.2, 6.1, -2.2); c.lineTo(6.9, -1.2); }
  c.closePath();
}
function drawHairBackMass(K) {
  // 뒤로 늘어진 머리 덩어리 (머리 뒤, 목덜미 위)
  const c = G.c, hs = K.hs, hc = K.hair;
  if (hs === 'long' || hs === 'flowing' || hs === 'bob') {
    c.beginPath();
    c.moveTo(-3, -6); c.quadraticCurveTo(-9, -4, -8.4, 3);
    if (hs === 'bob') { c.quadraticCurveTo(-8, 6.6, -4.6, 6.8); c.quadraticCurveTo(-2, 6.4, -1, 3); }
    else { c.quadraticCurveTo(-8.6, 9, -6.4, 12.5); c.lineTo(-2.2, 11.5); c.quadraticCurveTo(-2.5, 5, -0.5, 2); }
    c.closePath();
    c.fillStyle = grad(-9, 0, 0, 2, sh(hc, -0.12)); c.fill(); outline(hc, 0.7);
  }
}
function drawHead(s, K, E, P) {
  const c = G.c, hr = K.headR / 6.7;
  c.save();
  c.translate(s.hx, s.hy); c.rotate(s.ha); c.scale(hr, hr);
  const hg = K.hg, hs = K.hs, hc = K.hair;
  const helm = hg === 'helm';
  if (!helm && hg !== 'hood' && hg !== 'veil') drawHairBackMass(K);
  // 얼굴
  const H = K.fem || K.kid ? HEAD_F : HEAD_M;
  smoothClosed(c, H, 14);
  c.fillStyle = grad(-6.5, -2, 7, 2, K.skin, 0.8); c.fill(); outline(K.skin, 0.75);
  if (!G.tint && !helm) {
    // 턱 그림자 / 볼 홍조
    c.fillStyle = ra(sh(K.skin, -0.45), 0.22); c.beginPath(); c.moveTo(-3.8, 3.8); c.quadraticCurveTo(1, 7.4, 5.2, 5.8); c.quadraticCurveTo(1, 5.8, -3.8, 3.8); c.fill();
    if (K.fem || K.kid) { c.fillStyle = ra('#ff8a8a', 0.22); ellipse(3.8, 2.4, 1.6, 0.9); c.fill(); }
    // 귀
    if (hs !== 'long' && hs !== 'flowing' && hs !== 'bob' && hg !== 'hood' && hg !== 'veil') {
      ellipse(-0.6, 1.0, 1.15, 1.7, 0.25); c.fillStyle = sh(K.skin, -0.1); c.fill();
      c.strokeStyle = ra(sh(K.skin, -0.55), 0.7); c.lineWidth = 0.4; c.beginPath(); c.arc(-0.5, 1.0, 0.7, -1.2, 1.6); c.stroke();
    }
    drawFace(K, E, P);
    if (K.beard) drawBeard(K);
  }
  // 앞머리 / 머리장식
  if (!helm && hg !== 'hood' && hg !== 'veil') drawHairFront(K);
  if (K.band && !hg) drawBand(K);
  if (K.hachi) drawHachi(K);
  if (hg) drawHeadgear(K, E);
  if (K.hs === 'bald' && !hg && !G.tint) { c.fillStyle = ra('#ffffff', 0.35); ellipse(0.5, -6.2, 2.4, 0.9, -0.2); c.fill(); }
  // 눈빛
  if (K.eyeGlow && G.fx && !G.tint) eyeGlow(K, E);
  if (K.halo) drawHalo(-0.5, -13.5 + Math.sin(G.t * 2) * 0.6, 6.8, K.aura?.color || '#ffe9a0');
  c.restore();
}
function drawFace(K, E, P) {
  const c = G.c;
  const blink = ((G.t + (E.p.cx || 0) * 0.013) % 3.7) < 0.11 || (E.p.anim === 'death' && E.p.animT > 0.4);
  const hurt = E.p.anim === 'hurt';
  const ec = K.eyeGlow ? sh(K.eyes, 0.25) : K.eyes;
  const big = K.fem || K.kid;
  // 눈두덩 그늘
  c.fillStyle = ra(sh(K.skin, -0.5), 0.18); ellipse(3.9, -1.2, 2.4, 1.1, 0.1); c.fill();
  if (!blink) {
    // 흰자(안쪽만 살짝) + 홍채
    if (big) { c.fillStyle = '#f4eeea'; ellipse(4.3, -0.35, 1.25, 0.95); c.fill(); }
    ellipse(3.9, -0.25, big ? 1.0 : 0.82, big ? 1.2 : 0.95); c.fillStyle = ec; c.fill();
    ellipse(4.05, -0.15, big ? 0.45 : 0.38, big ? 0.65 : 0.5); c.fillStyle = K.eyeGlow ? '#fffbe8' : '#0e0606'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillRect(3.55, -0.95, big ? 0.55 : 0.4, big ? 0.5 : 0.38);
  }
  // 윗눈꺼풀(속눈썹)
  c.strokeStyle = '#120806'; c.lineCap = 'round';
  c.lineWidth = big ? 0.85 : 0.7;
  c.beginPath();
  if (blink) { c.moveTo(2.5, -0.3); c.quadraticCurveTo(3.8, 0.35, 5.1, -0.2); }
  else { c.moveTo(2.4, -0.5); c.quadraticCurveTo(3.6, -1.75, 5.1, -1.0); if (big) { c.moveTo(2.5, -0.55); c.lineTo(1.9, -0.95); } }
  c.stroke();
  // 먼 눈: 짧은 획
  c.lineWidth = 0.55; c.beginPath(); c.moveTo(5.9, -0.95); c.quadraticCurveTo(6.25, -1.15, 6.5, -0.85); c.stroke();
  // 눈썹
  c.strokeStyle = sh(K.hair, -0.35); c.lineWidth = big ? 0.55 : 0.9;
  c.beginPath();
  if (hurt) { c.moveTo(2.4, -3.3); c.lineTo(5.6, -2.4); }
  else if (big) { c.moveTo(2.4, -2.75); c.quadraticCurveTo(4, -3.35, 5.7, -2.6); }
  else { c.moveTo(2.0, -3.2); c.quadraticCurveTo(4.2, -3.1, 6.0, -2.3); }
  c.stroke();
  // 코·입
  c.strokeStyle = ra(sh(K.skin, -0.5), 0.75); c.lineWidth = 0.45;
  c.beginPath(); c.moveTo(6.7, 0.3); c.lineTo(6.95, 1.5); c.lineTo(6.3, 1.9); c.stroke();
  c.strokeStyle = big ? '#a8454e' : ra(sh(K.skin, -0.55), 0.9); c.lineWidth = big ? 0.6 : 0.5;
  c.beginPath();
  if (hurt) { c.ellipse(5.3, 3.9, 0.7, 0.55, 0, 0, TAU); c.fillStyle = '#3a1010'; c.fill(); }
  else { c.moveTo(4.7, 3.8); c.quadraticCurveTo(5.3, 3.95, 5.95, 3.65); c.stroke(); }
  void P;
}
function drawBeard(K) {
  const c = G.c, hc = K.hair;
  if (K.beard === 'stubble') {
    c.beginPath(); c.moveTo(-1.5, 2.2); c.quadraticCurveTo(-0.5, 6.2, 3.2, 6.8); c.quadraticCurveTo(5.4, 6.2, 6.1, 4.4); c.lineTo(6.2, 2.9); c.quadraticCurveTo(4.8, 3.0, 3.8, 3.6); c.quadraticCurveTo(1.6, 4.2, -1.5, 2.2);
    c.fillStyle = ra(sh(hc, -0.1), 0.42); c.fill();
    return;
  }
  // 풍성한 수염
  c.beginPath();
  c.moveTo(-2.6, 1.0); c.quadraticCurveTo(-3.4, 5.2, 0.4, 8.6); c.quadraticCurveTo(2.8, 10.8, 4.6, 10.6); c.quadraticCurveTo(6.9, 8.5, 6.6, 5.4);
  c.lineTo(7.2, 2.6); c.quadraticCurveTo(6.4, 1.9, 5.0, 2.7); c.quadraticCurveTo(3.4, 3.4, 2.6, 4.4); c.quadraticCurveTo(0.8, 3.2, -0.4, 0.2); c.closePath();
  c.fillStyle = grad(-3, 2, 7, 6, hc, 0.9); c.fill(); outline(hc, 0.6);
  c.strokeStyle = ra(sh(hc, 0.35), 0.7); c.lineWidth = 0.4; c.beginPath();
  for (let i = 0; i < 4; i++) { c.moveTo(0.8 + i * 1.3, 5 + i * 0.3); c.quadraticCurveTo(1.4 + i * 1.3, 7.5, 1.6 + i * 1.2, 9 + i * 0.2); }
  c.stroke();
}
function drawHairFront(K) {
  const c = G.c, hs = K.hs, hc = K.hair;
  if (hs === 'bald') return;
  hairCapPath(c, hs);
  c.fillStyle = grad(-8, -7, 7, 2, hc, 0.9); c.fill(); outline(hc, 0.7);
  let extra = true;
  c.beginPath();
  if (hs === 'spiky') {
    c.moveTo(6.4, -4.4); c.lineTo(9.8, -4.6); c.lineTo(6.2, -6.8); c.lineTo(7.2, -10.2); c.lineTo(2.8, -8.6); c.lineTo(1.2, -12.8); c.lineTo(-1.8, -9.2);
    c.lineTo(-6.8, -11.4); c.lineTo(-6.0, -7.4); c.lineTo(-11.0, -6.0); c.lineTo(-7.8, -3.6); c.lineTo(-10.4, 0.2); c.lineTo(-7.2, 0.2); c.lineTo(-5.6, -3.4); c.lineTo(4.6, -4.8); c.closePath();
  } else if (hs === 'bob') {
    c.moveTo(-1.6, -3.0); c.quadraticCurveTo(-2.4, 2.2, 0.2, 5.8); c.lineTo(1.4, 4.2); c.lineTo(2.4, 5.6); c.quadraticCurveTo(1.0, 2.2, 1.8, -2.4); c.closePath();
  } else if (hs === 'long' || hs === 'flowing') {
    // 얼굴 옆으로 흘러내리는 앞머리 가닥
    c.moveTo(1.0, -2.8); c.quadraticCurveTo(-0.6, 2.6, 1.2, 7.4); c.quadraticCurveTo(1.8, 10, 0.8, hs === 'flowing' ? 13.4 : 11); c.quadraticCurveTo(2.9, 8.8, 2.8, 5.6); c.quadraticCurveTo(2.2, 2.4, 2.9, -2.2); c.closePath();
  } else extra = false;
  if (extra) { c.fillStyle = grad(-2, -6, 7, 2, hc, 0.9); c.fill(); outline(hc, 0.6); }
  if (G.tint) return;
  // 윤기 + 결
  c.strokeStyle = ra(sh(hc, 0.6), 0.5); c.lineWidth = 1.1; c.lineCap = 'round';
  c.beginPath(); c.moveTo(4.6, -7.0); c.quadraticCurveTo(0.8, -9.2, -4.2, -7.6); c.stroke();
  c.strokeStyle = ra(sh(hc, -0.45), 0.55); c.lineWidth = 0.45;
  c.beginPath(); c.moveTo(-6.6, -5.0); c.quadraticCurveTo(-7.6, -1.6, -7.4, 1.6); c.moveTo(-3.8, -8.2); c.quadraticCurveTo(-6.0, -5.2, -5.8, -1.0); c.moveTo(3.2, -8.2); c.quadraticCurveTo(4.8, -5.4, 4.6, -2.8); c.stroke();
  if (hs === 'ponytail' || hs === 'braid') {
    ellipse(-7.4, -3.9, 1.3, 1.9, 0.5); c.fillStyle = K.o === 'hunter' ? '#8a1426' : sh(K.se, 0); c.fill(); outline('#3a0a10', 0.45);
  }
}
function drawHeadgear(K, E) {
  const c = G.c, hg = K.hg;
  const hc = K.hgC || (hg === 'veil' ? K.se : hg === 'hood' ? K.pr : hg === 'helm' ? (K.heavy ? K.ac : '#8a8e9a') : hg === 'horns' ? '#d8ccb4' : hg === 'mask' ? (K.o === 'ninja' ? '#141018' : '#1a1418') : hg === 'hat' ? K.pr : hg === 'wide_hat' ? '#1a1414' : '#e8c872');
  const gold = '#e8c872';
  switch (hg) {
    case 'hood': {
      c.beginPath();
      c.moveTo(7.2, -2.6); c.quadraticCurveTo(7.4, -9.2, 1.2, -10.4); c.quadraticCurveTo(-6.8, -10.4, -9.2, -4.8);
      c.quadraticCurveTo(-11.6 - SW.tr * 0.25, -7.6, -13.2 - SW.tr * 0.4, -5.4 + SW.lift * 0.2); c.quadraticCurveTo(-11.2, -1.8, -9.6, 1.6);
      c.quadraticCurveTo(-9.4, 7.4, -5.8, 9.6); c.lineTo(1.6, 9.2); c.quadraticCurveTo(-1.4, 5, 0.6, 1); c.quadraticCurveTo(2.2, -3.4, 7.2, -2.6); c.closePath();
      c.fillStyle = grad(-10, -6, 8, 2, hc, 1); c.fill(); outline(hc, 0.75);
      if (!G.tint) {
        // 얼굴 위 그늘
        const g = c.createLinearGradient(0, -5, 0, 2.5);
        g.addColorStop(0, 'rgba(8,4,14,0.75)'); g.addColorStop(1, 'rgba(8,4,14,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(0.8, 1); c.quadraticCurveTo(2.4, -3.2, 7.2, -2.6); c.lineTo(7.6, 2.4); c.lineTo(0.6, 2.4); c.closePath(); c.fill();
        c.strokeStyle = ra(sh(hc, 0.4), 0.6); c.lineWidth = 0.6; c.beginPath(); c.moveTo(7.2, -2.6); c.quadraticCurveTo(2.2, -3.4, 0.6, 1); c.quadraticCurveTo(-1.4, 5, 1.6, 9.2); c.stroke();
      }
      break;
    }
    case 'hat': { // 마법사 모자
      const bend = SW.tr * 0.25 + Math.sin(G.t * 2) * 0.4;
      c.beginPath(); c.moveTo(-5.4, -6.8); c.quadraticCurveTo(-4, -14, -4.5 - bend, -18); c.quadraticCurveTo(-7 - bend * 1.4, -21, -11 - bend * 1.8, -19.6);
      c.quadraticCurveTo(-5.4, -17.6, -1.2, -14.6); c.quadraticCurveTo(3, -10, 5.2, -7.2); c.closePath();
      c.fillStyle = grad(-7, -14, 5, -8, hc, 1); c.fill(); outline(hc, 0.7);
      ellipse(-0.2, -6.6, 12.2, 2.5, -0.1); c.fillStyle = grad(0, -9, 0, -4, sh(hc, -0.1)); c.fill(); outline(hc, 0.7);
      if (!G.tint) { c.beginPath(); c.moveTo(-5.3, -7.4); c.quadraticCurveTo(0, -9.8, 5.1, -7.8); c.lineTo(4.9, -9.2); c.quadraticCurveTo(0, -11, -5, -9); c.closePath(); c.fillStyle = K.se; c.fill(); gem(-0.2, -9, 1.1, K.magicC); }
      break;
    }
    case 'wide_hat': {
      c.beginPath(); c.moveTo(-5.8, -6.6); c.quadraticCurveTo(-6.4, -11.8, -4, -12.8); c.quadraticCurveTo(0, -11.6, 4.2, -13.2); c.quadraticCurveTo(6.4, -11.6, 5.6, -6.6); c.closePath();
      c.fillStyle = grad(-6, -12, 6, -6, hc, 1); c.fill(); outline(hc, 0.7);
      if (!G.tint) { c.beginPath(); c.moveTo(-5.9, -7.1); c.quadraticCurveTo(0, -8.4, 5.7, -7.3); c.lineTo(5.8, -8.8); c.quadraticCurveTo(0, -9.8, -6.0, -8.6); c.closePath(); c.fillStyle = K.o === 'gunslinger' ? '#6a3a24' : K.se; c.fill(); }
      c.beginPath(); c.ellipse(0.8, -6.6, 13.2, 2.8, -0.08, 0, TAU);
      c.fillStyle = grad(0, -10, 0, -3, sh(hc, 0.05)); c.fill(); outline(hc, 0.7);
      if (!G.tint) {
        c.strokeStyle = ra(sh(hc, 0.45), 0.6); c.lineWidth = 0.5; c.beginPath(); c.ellipse(0.8, -6.6, 13.2, 2.8, -0.08, PI * 1.1, PI * 1.9); c.stroke();
        const g = c.createLinearGradient(0, -4, 0, 1.5); g.addColorStop(0, 'rgba(6,2,10,0.62)'); g.addColorStop(1, 'rgba(6,2,10,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(-6, -4.2); c.lineTo(8.5, -4.8); c.lineTo(8.2, 1.4); c.lineTo(-6, 1.4); c.closePath(); c.fill();
      }
      break;
    }
    case 'helm': {
      c.beginPath();
      c.moveTo(7.6, -1.0); c.quadraticCurveTo(7.4, -7.6, 1.4, -9.2); c.quadraticCurveTo(-5.6, -9.6, -7.6, -4.6); c.quadraticCurveTo(-8.4, 1.8, -7.0, 5.2);
      c.lineTo(-6.8, 7.4); c.lineTo(-1.4, 7.8); c.quadraticCurveTo(3.4, 8.2, 6.4, 6.4); c.lineTo(8.2, 2.6); c.closePath();
      c.fillStyle = grad(-8, -6, 8, 3, hc, 1.1); c.fill(); outline(hc, 0.8);
      if (!G.tint) {
        // 능선·바이저·숨구멍
        c.strokeStyle = ra('#ffffff', 0.45); c.lineWidth = 0.6; c.beginPath(); c.moveTo(6.4, -5.2); c.quadraticCurveTo(1.4, -9.2, -5.4, -6.8); c.stroke();
        c.fillStyle = '#07040a'; c.beginPath(); c.moveTo(2.2, -1.6); c.lineTo(8.0, -1.9); c.lineTo(8.1, -0.3); c.lineTo(2.4, 0.1); c.closePath(); c.fill();
        c.fillStyle = ra('#07040a', 0.8); for (let i = 0; i < 3; i++) c.fillRect(5.2 + i * 0.9, 2.2, 0.45, 2);
        c.strokeStyle = K.heavy ? K.at : gold; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-7.2, 5.6); c.lineTo(-1.4, 6.4); c.quadraticCurveTo(3.4, 6.8, 6.8, 5.2); c.stroke();
        if (K.armor === 'holy' || K.o === 'knight' && K.L.halo) { c.fillStyle = gold; c.fillRect(3.2, -7.8, 1.1, 5.2); c.fillRect(1.9, -6.4, 3.7, 1); }
        if (K.eyeGlow || K.armor === 'holy' || K.armor === 'dark') { const ec = K.eyeGlow ? K.eyes : K.armor === 'dark' ? '#ff2a2a' : '#fff2b0'; c.fillStyle = ec; c.fillRect(4.4, -1.4, 3, 0.8); glow(6, -1, 6, ec, 0.7); }
      }
      // 투구 장식 깃
      {
        const pc = K.o === 'knight' || K.heavy ? (K.armor === 'dark' ? '#8a0a14' : K.se === K.pr ? '#c01020' : K.se) : K.se;
        const pcol = K.armor === 'holy' ? (K.L.primary && K.L.secondary ? K.L.secondary : '#c01020') : pc;
        c.beginPath(); c.moveTo(1.4, -9.2); c.quadraticCurveTo(-4, -14 - SW.lift * 0.2, -12 - SW.tr * 0.6, -9 + SW.lift * 0.3);
        c.quadraticCurveTo(-15 - SW.tr * 0.8, -4 + SW.fl, -13 - SW.tr * 0.8, 2); c.quadraticCurveTo(-11, -4, -6.6, -7.6); c.closePath();
        c.fillStyle = grad(-12, -10, 2, -4, pcol, 0.9); c.fill(); outline(pcol, 0.6);
      }
      break;
    }
    case 'circlet': {
      c.strokeStyle = F(gold); c.lineWidth = 1.1;
      c.beginPath(); c.moveTo(-6.6, -3.2); c.quadraticCurveTo(0, -5.8, 6.4, -3.6); c.stroke();
      if (!G.tint) { c.strokeStyle = '#fff4c0'; c.lineWidth = 0.4; c.beginPath(); c.moveTo(-5, -3.9); c.quadraticCurveTo(0, -6, 5.6, -4.1); c.stroke(); gem(5.8, -3.6, 1.2, K.aura?.color || '#5aa8ff'); }
      break;
    }
    case 'crown': {
      c.beginPath(); c.moveTo(-5.8, -6.2);
      const pts = [-5.8, -11.2, -3.6, -8.2, -1.2, -12.4, 1.2, -8.4, 3.4, -12.0, 5.0, -8.2, 6.2, -10.6];
      for (let i = 0; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
      c.lineTo(6.0, -5.6); c.quadraticCurveTo(0, -4.6, -5.8, -6.2); c.closePath();
      c.fillStyle = grad(-6, -12, 6, -5, gold, 1); c.fill(); outline('#8a6a20', 0.6);
      if (!G.tint) { gem(0.2, -6.4, 1.2, '#ff2a44'); gem(-3.6, -6.8, 0.8, '#5aa8ff'); gem(4.2, -6.4, 0.8, '#5aa8ff'); for (const [x, y] of [[-5.8, -11.2], [-1.2, -12.4], [3.4, -12.0], [6.2, -10.6]]) { c.fillStyle = '#fff4c0'; c.beginPath(); c.arc(x, y, 0.6, 0, TAU); c.fill(); } }
      break;
    }
    case 'horns': {
      for (const far of [1, 0]) {
        const o = far ? -1.8 : 0, d = far ? -0.35 : 0;
        c.beginPath(); c.moveTo(2.6 + o, -6.4); c.quadraticCurveTo(-1 + o, -12.6, -7.4 + o, -13.6); c.quadraticCurveTo(-11.8 + o, -13.4, -13.8 + o, -9.8);
        c.quadraticCurveTo(-11.4 + o, -11.4, -8 + o, -11); c.quadraticCurveTo(-3.6 + o, -9.8, -1 + o, -5.4); c.closePath();
        const hcol = sh(hc, d);
        c.fillStyle = grad(-10, -14, 2, -6, hcol, 1); c.fill(); outline(hcol, 0.6);
        if (!G.tint) { c.strokeStyle = ra(sh(hcol, -0.4), 0.7); c.lineWidth = 0.4; c.beginPath(); for (let i = 1; i < 5; i++) { const u = i / 5; c.moveTo(lerp(1.5, -11, u) + o, lerp(-6.4, -12, u) - Math.sin(u * PI) * 3); c.lineTo(lerp(0, -10, u) + o, lerp(-5, -10.5, u) - Math.sin(u * PI) * 2.2); } c.stroke(); }
      }
      break;
    }
    case 'veil': {
      // 두건(흰 코이프) + 베일 머리 부분
      c.beginPath(); c.moveTo(6.2, -4.4); c.quadraticCurveTo(0.6, -6.6, -1.2, -3); c.quadraticCurveTo(-2.4, 2.6, 0.4, 6.8); c.quadraticCurveTo(3.4, 8.8, 6.0, 6.4);
      c.quadraticCurveTo(3.2, 7.2, 1.8, 5.4); c.quadraticCurveTo(0, 1.8, 1.4, -2.2); c.quadraticCurveTo(3.2, -4.6, 6.4, -3.4); c.closePath();
      c.fillStyle = grad(-2, -4, 6, 4, '#f4f0e8', 0.7); c.fill(); outline('#f4f0e8', 0.6);
      c.beginPath(); c.moveTo(6.6, -4.2); c.quadraticCurveTo(6.4, -8.8, 0.8, -9.6); c.quadraticCurveTo(-6.8, -9.8, -8.8, -3.6);
      c.quadraticCurveTo(-9.8, 3.6, -7.8, 9.6); c.lineTo(-2.4, 9.4); c.quadraticCurveTo(-1.6, 3, -0.6, -3.2); c.quadraticCurveTo(2.4, -5.8, 6.6, -4.2); c.closePath();
      c.fillStyle = grad(-9, -6, 6, 0, hc, 1); c.fill(); outline(hc, 0.7);
      if (!G.tint) { c.strokeStyle = K.tr; c.lineWidth = 0.7; c.beginPath(); c.moveTo(6.6, -4.2); c.quadraticCurveTo(2.4, -5.8, -0.6, -3.2); c.quadraticCurveTo(-1.6, 3, -2.4, 9.4); c.stroke(); }
      break;
    }
    case 'mask': {
      c.beginPath(); c.moveTo(7.6, 0.6); c.quadraticCurveTo(7.6, 4.6, 5.4, 6.6); c.quadraticCurveTo(1.6, 8.2, -2.6, 5.8); c.quadraticCurveTo(-5.4, 3.8, -6.2, 0.6);
      c.quadraticCurveTo(-2, 0.9, 1.4, 0.6); c.quadraticCurveTo(4.6, 0.2, 7.6, 0.6); c.closePath();
      c.fillStyle = grad(-6, 0, 7, 5, hc, 0.9); c.fill(); outline(hc, 0.6);
      if (!G.tint) {
        c.strokeStyle = ra(sh(hc, 0.5), 0.6); c.lineWidth = 0.4; c.beginPath(); c.moveTo(7.2, 1.2); c.quadraticCurveTo(3, 1, -5.6, 1.2); c.stroke();
        c.strokeStyle = ra(sh(hc, -0.5), 0.6); c.beginPath(); c.moveTo(6.4, 3.4); c.quadraticCurveTo(3, 4.6, -1.5, 3.6); c.stroke();
      }
      break;
    }
    case 'tiara': {
      c.beginPath(); c.moveTo(-3.6, -6.6); c.quadraticCurveTo(1, -7.6, 5.8, -4.9); c.lineTo(5.6, -6.2); c.lineTo(4.2, -7.2); c.lineTo(3.2, -9.6); c.lineTo(2, -7.8); c.lineTo(0.2, -8.8); c.lineTo(-1, -7.8); c.lineTo(-3.4, -7.8); c.closePath();
      c.fillStyle = grad(-3, -10, 6, -5, '#f0e0a8', 1); c.fill(); outline('#a08030', 0.5);
      if (!G.tint) gem(3.1, -7.4, 1, K.aura?.color && K.aura.color !== '#fff8d0' ? K.aura.color : '#8ac8ff');
      break;
    }
    default: break;
  }
  void E;
}
function gem(x, y, r, col) {
  const c = G.c;
  c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.8, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.8, y); c.closePath();
  c.fillStyle = F(col); c.fill();
  if (!G.tint) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x - r * 0.3, y - r * 0.5, r * 0.35, r * 0.3); glow(x, y, r * 4, col, 0.45); }
}
function eyeGlow(K, E) {
  const c = G.c;
  const hood = K.hg === 'hood' || K.hg === 'wide_hat';
  glow(4.1, -0.5, 4.2, K.eyes, 0.9);
  glow(4.1, -0.5, 9, K.eyes, 0.25);
  c.save(); c.globalCompositeOperation = 'lighter';
  c.fillStyle = ra(sh(K.eyes, 0.5), 0.95); ellipse(4.1, -0.5, 0.9, 0.7); c.fill();
  // 이동 시 빛 꼬리
  const v = Math.abs(E.p.vx || 0);
  if (v > 150) {
    const L = Math.min(16, v * 0.035);
    const g = c.createLinearGradient(4, 0, 4 - L, 0); g.addColorStop(0, ra(K.eyes, 0.8)); g.addColorStop(1, ra(K.eyes, 0));
    c.strokeStyle = g; c.lineWidth = 0.9; c.beginPath(); c.moveTo(4.1, -0.5); c.quadraticCurveTo(4.1 - L * 0.5, -0.8, 4.1 - L, 0.2 + Math.sin(G.t * 10)); c.stroke();
  }
  if (hood) { c.fillStyle = ra(K.eyes, 0.9); ellipse(6.2, -0.6, 0.5, 0.5); c.fill(); }
  c.restore();
}

// ───────────────────────── 체인 기반 레이어 ─────────────────────────
function headPt(s, K, x, y) {
  const hr = K.headR / 6.7, c = Math.cos(s.ha), si = Math.sin(s.ha);
  QX = s.hx + (x * c - y * si) * hr; QY = s.hy + (x * si + y * c) * hr;
}
/** 체인 띠(머리카락·스카프·베일)용 원통 음영: 시작→끝 현(chord)에 수직인 그라디언트. 굽은 띠도 끝단이 과하게 밝아지지 않도록 폭을 넉넉히 */
function ribGrad(P, n, w, base, k = 1) {
  const x0 = P[0], y0 = P[1], x1 = P[(n - 1) * 2], y1 = P[(n - 1) * 2 + 1];
  let dx = x1 - x0, dy = y1 - y0;
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  let nx = -dy, ny = dx;
  if (nx * -0.8 + ny * -0.6 < 0) { nx = -nx; ny = -ny; }
  // 현에서 가장 멀리 벗어난 점까지 포함
  let dev = 0;
  for (let i = 1; i < n - 1; i++) { const e = Math.abs((P[i * 2] - x0) * nx + (P[i * 2 + 1] - y0) * ny); if (e > dev) dev = e; }
  const r = Math.max(w * 1.3, 4) + dev;
  const mxp = (x0 + x1) / 2, myp = (y0 + y1) / 2;
  return grad(mxp + nx * r, myp + ny * r, mxp - nx * r, myp - ny * r, base, k);
}
// 체인 설정 (매 프레임 객체 생성을 피하려고 모듈 상수로)
const CC_HAIR2 = { g: 1200, d: 0.88, push: 240, rest: 0.5, curl: 0.12, flut: 120 };
const CC_VEIL = { g: 1400, d: 0.9, push: 150, rest: 0.3, curl: 0.06, flut: 60 };
const CC_VHAIR = { g: 1400, d: 0.9, push: 150, rest: 0.22, curl: 0.05 };
const CC_SCARF = { g: 1100, d: 0.9, push: 250, rest: 0.5, curl: 0.03, flut: 150 };
const CC_SCARF_L = { g: 950, d: 0.9, push: 400, rest: 0.9, curl: 0.03, flut: 200 };
// up: 망토 점이 앵커(어깨) 위로 올라갈 수 있는 한계(로컬 단위) — chain() 참고
const CC_CAPE = { g: 1500, d: 0.93, push: 90, rest: 0.12, curl: 0.04, flut: 110, up: 3 };
const CC_BAND = { g: 900, d: 0.9, push: 360, rest: 0.95, curl: 0.12, flut: 240 };
const CC_BAND2 = { g: 900, d: 0.9, push: 360, rest: 1.4, curl: 0.12, flut: 240 };
const HAIR_CFG = {
  ponytail: { n: 7, seg: 4.4, w0: 3.0, w1: 0.6, ax: -7.6, ay: -3.6, cfg: { g: 1150, d: 0.88, push: 260, rest: 0.75, curl: 0.1 } },
  long: { n: 6, seg: 4.6, w0: 4.2, w1: 2.4, ax: -4.6, ay: 1.5, cfg: { g: 1500, d: 0.9, push: 120, rest: 0.18, curl: 0.03 } },
  flowing: { n: 7, seg: 5.0, w0: 5.4, w1: 1.4, ax: -5.2, ay: 0.5, cfg: { g: 1100, d: 0.9, push: 200, rest: 0.35, curl: 0.08, flut: 90 } },
  braid: { n: 6, seg: 4.2, w0: 1.8, w1: 1.1, ax: -5.6, ay: 1.8, cfg: { g: 1500, d: 0.9, push: 100, rest: 0.15, curl: 0.03 } },
};
/** 헌터 머리띠 (머리 로컬 좌표) */
function drawBand(K) {
  const c = G.c, bc = K.band;
  c.beginPath(); c.moveTo(-8.4, -3.2); c.quadraticCurveTo(-1, -7.4, 7.0, -4.0); c.lineTo(6.9, -2.3); c.quadraticCurveTo(-1, -5.6, -8.0, -1.4); c.closePath();
  c.fillStyle = grad(-8, -6, 7, -2, bc, 0.8); c.fill(); outline(bc, 0.55);
  if (G.tint) return;
  ellipse(-8.3, -2.4, 1.5, 1.8, 0.3); c.fillStyle = sh(bc, -0.15); c.fill(); outline(bc, 0.45); // 매듭
  c.strokeStyle = ra(sh(bc, 0.45), 0.7); c.lineWidth = 0.4; c.beginPath(); c.moveTo(-6, -4.3); c.quadraticCurveTo(0, -6.8, 6.2, -3.8); c.stroke();
}
/** 닌자 이마 보호대(하치가네) */
function drawHachi(K) {
  const c = G.c, bc = sh(K.se, -0.1);
  c.beginPath(); c.moveTo(-8.2, -3.6); c.quadraticCurveTo(-1, -7.8, 7.2, -4.4); c.lineTo(7.1, -2.4); c.quadraticCurveTo(-1, -5.8, -7.9, -1.6); c.closePath();
  c.fillStyle = grad(-8, -6, 7, -2, bc, 0.8); c.fill(); outline(bc, 0.5);
  // 쇠 판
  c.beginPath(); c.moveTo(1.2, -6.2); c.quadraticCurveTo(4.4, -6.6, 7.3, -4.9); c.lineTo(7.2, -2.0); c.quadraticCurveTo(4.3, -3.4, 1.4, -3.2); c.closePath();
  c.fillStyle = G.tint || (() => { const g = c.createLinearGradient(0, -6.5, 0, -2); g.addColorStop(0, '#d8dce8'); g.addColorStop(0.45, '#8a8e9e'); g.addColorStop(1, '#3a3a48'); return g; })();
  c.fill(); outline('#6a6e7e', 0.45);
  if (!G.tint) { c.strokeStyle = ra('#1a1a24', 0.8); c.lineWidth = 0.35; c.beginPath(); c.moveTo(3.2, -5.4); c.lineTo(4.6, -3.6); c.moveTo(4.6, -5.6); c.lineTo(3.2, -3.4); c.stroke(); }
}
/** 머리띠 꼬리 두 가닥 (베를레 체인) */
function drawBandTails(s, K, E) {
  if (!K.band || K.hg) return;
  const c = G.c;
  headPt(s, K, -8.4, -2.6); tx0(E.P, QX, QY);
  const ax = TX, ay = TY;
  for (let j = 1; j >= 0; j--) {
    const n = 5, pts = chain(j ? 'band2' : 'band', E, ax, ay, n, j ? 3.1 : 3.8, j ? CC_BAND2 : CC_BAND, ax + 1);
    for (let i = 0; i < n; i++) WS[i] = lerp(1.05, 0.75, i / (n - 1));
    ribbonPath(c, pts, n, WS, false);
    const bc = sh(K.band, -0.22 * j);
    c.fillStyle = ribGrad(pts, n, 1.1, bc, 0.8); c.fill(); outline(bc, 0.45);
  }
}
function drawHairChains(s, K, E) {
  const cfg = HAIR_CFG[K.hs];
  if (!cfg || K.hg === 'helm' || K.hg === 'hood' || K.hg === 'veil') return;
  const c = G.c, hc = K.hair;
  headPt(s, K, cfg.ax, cfg.ay); tx0(E.P, QX, QY);
  const pts = chain('hair', E, TX, TY, cfg.n, cfg.seg, cfg.cfg, TX + 1.5);
  for (let i = 0; i < cfg.n; i++) WS[i] = lerp(cfg.w0, cfg.w1, i / (cfg.n - 1)) * (K.headR / 6.7);
  if (K.hs === 'braid') {
    for (let i = cfg.n - 1; i >= 0; i--) { ellipse(pts[i * 2], pts[i * 2 + 1], WS[i] * 1.3, WS[i]); c.fillStyle = grad(pts[i * 2] - 2, pts[i * 2 + 1] - 2, pts[i * 2] + 2, pts[i * 2 + 1] + 2, hc); c.fill(); outline(hc, 0.5); }
    return;
  }
  ribbonPath(c, pts, cfg.n, WS, true);
  c.fillStyle = ribGrad(pts, cfg.n, cfg.w0, hc, 0.9); c.fill(); outline(hc, 0.7);
  if (!G.tint) {
    c.strokeStyle = ra(sh(hc, 0.5), 0.5); c.lineWidth = 0.6; c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 1; i < cfg.n - 1; i++) c.lineTo(pts[i * 2] - 0.6, pts[i * 2 + 1]);
    c.stroke();
  }
  if (K.hs === 'flowing') {
    headPt(s, K, -3.2, 3.5); tx0(E.P, QX, QY);
    const p2 = chain('hair2', E, TX, TY, 6, 4.4, CC_HAIR2, TX + 1);
    for (let i = 0; i < 6; i++) WS[i] = lerp(3.0, 0.6, i / 5);
    ribbonPath(c, p2, 6, WS, true);
    c.fillStyle = ribGrad(p2, 6, 3, sh(hc, -0.08), 0.9); c.fill(); outline(hc, 0.6);
  }
}
function drawVeil(s, K, E) {
  if (K.hg !== 'veil') return;
  const c = G.c;
  headPt(s, K, -4.2, -5.2); tx0(E.P, QX, QY);
  const n = 5;
  const pts = chain('veil', E, TX, TY, n, 5.6, CC_VEIL, TX + 2);
  for (let i = 0; i < n; i++) WS[i] = lerp(4.2, 6.4, i / (n - 1));
  const vc = K.hgC || K.se;
  ribbonPath(c, pts, n, WS, false);
  c.fillStyle = ribGrad(pts, n, 6, vc, 1); c.fill(); outline(vc, 0.7);
  if (!G.tint) { c.strokeStyle = ra(sh(vc, 0.35), 0.6); c.lineWidth = 0.5; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 1; i < n; i++) c.lineTo(pts[i * 2] + 1.2, pts[i * 2 + 1]); c.stroke(); }
  // 은발이 베일 밑으로
  if (K.hs === 'long' || K.hs === 'flowing') {
    headPt(s, K, -3.4, 2.8); tx0(E.P, QX, QY);
    const hp = chain('hair', E, TX, TY, 5, 4.4, CC_VHAIR, TX + 1);
    for (let i = 0; i < 5; i++) WS[i] = lerp(2.6, 1.2, i / 4);
    ribbonPath(c, hp, 5, WS, true); c.fillStyle = ribGrad(hp, 5, 2.6, K.hair); c.fill(); outline(K.hair, 0.5);
  }
}
function drawScarfTail(s, K, E) {
  if (!K.scarf) return;
  const c = G.c, sc = K.scarf;
  sp(s, K, 1.02, -backAt(K, 1) - 0.5); tx0(E.P, QX, QY);
  const n = sc.long ? 11 : 6;
  const pts = chain('scarf', E, TX, TY, n, sc.long ? 5.6 : 4.6, sc.long ? CC_SCARF_L : CC_SCARF, TX + 1);
  for (let i = 0; i < n; i++) WS[i] = lerp(2.4, sc.long ? 1.9 : 1.6, i / (n - 1));
  ribbonPath(c, pts, n, WS, false);
  c.fillStyle = ribGrad(pts, n, 2.4, sc.c, 0.8); c.fill(); outline(sc.c, 0.6);
  if (!G.tint) {
    c.strokeStyle = ra(sh(sc.c, -0.45), 0.6); c.lineWidth = 0.5; c.beginPath(); c.moveTo(pts[2], pts[3]); for (let i = 2; i < n; i++) c.lineTo(pts[i * 2], pts[i * 2 + 1] + 0.3); c.stroke();
    // 끝단 술
    const e = (n - 1) * 2; c.strokeStyle = sh(sc.c, 0.2); c.lineWidth = 0.5; c.beginPath();
    const ta = Math.atan2(pts[e + 1] - pts[e - 1], pts[e] - pts[e - 2]);
    for (let k = -1; k <= 1; k++) { c.moveTo(pts[e] - Math.sin(ta) * k * 1.3, pts[e + 1] + Math.cos(ta) * k * 1.3); c.lineTo(pts[e] + Math.cos(ta) * 2.4 - Math.sin(ta) * k * 1.5, pts[e + 1] + Math.sin(ta) * 2.4 + Math.cos(ta) * k * 1.5); }
    c.stroke();
  }
}
function drawScarfWrap(s, K) {
  if (!K.scarf) return;
  const c = G.c, sc = K.scarf;
  const bx = s.nx + s.ux * 1.2, by = s.ny + s.uy * 1.2;
  c.save(); c.translate(bx, by); c.rotate(Math.atan2(s.fy, s.fx));
  c.beginPath(); c.moveTo(-4.4 * K.hW, -2.6); c.quadraticCurveTo(0, -4.4, 4.6 * K.hW, -2.4); c.quadraticCurveTo(5.8, 0.6, 4.2 * K.hW, 2.4); c.quadraticCurveTo(0, 3.6, -4.6 * K.hW, 2.2); c.quadraticCurveTo(-5.8, 0, -4.4 * K.hW, -2.6); c.closePath();
  c.fillStyle = grad(-5, -3, 5, 3, sc.c, 0.8); c.fill(); outline(sc.c, 0.6);
  if (!G.tint) {
    c.strokeStyle = ra(sh(sc.c, -0.45), 0.7); c.lineWidth = 0.5; c.beginPath(); c.moveTo(-4, 0.2); c.quadraticCurveTo(0, 1.2, 4.4, 0); c.stroke();
    if (!sc.long) { // 앞 매듭 자락
      c.beginPath(); c.moveTo(3.2, 1.6); c.quadraticCurveTo(5.4 + SW.fl, 5, 3.4 - SW.tr * 0.15, 8.6); c.lineTo(1.4 - SW.tr * 0.15, 8); c.quadraticCurveTo(2.8, 4.4, 1.6, 1.8); c.closePath();
      c.fillStyle = sh(sc.c, -0.1); c.fill(); outline(sc.c, 0.5);
    }
  }
  c.restore();
}
function drawCape(s, K, E) {
  const cp = K.cape;
  if (!cp) return;
  const c = G.c;
  sp(s, K, 0.94, -backAt(K, 0.94) + 0.8); tx0(E.P, QX, QY);
  const n = 7, len = 44 * cp.len;
  const pts = chain('cape', E, TX, TY, n, len / (n - 1), CC_CAPE, TX - 0.5);
  for (let i = 0; i < n; i++) WS[i] = lerp(3.6, 9.8 + cp.len * 2.2, Math.pow(i / (n - 1), 0.75)) * K.hW;
  // 안감(앞쪽 가장자리로 살짝 보임)
  ribbonPath(c, pts, n, WS, false);
  c.fillStyle = grad(pts[0], pts[1], pts[0] + 6, pts[1] + 30, sh(cp.c2, -0.1), 0.9); c.fill(); outline(cp.c2, 0.7);
  // 바깥면: 안감 쪽으로 1.6px 비켜서
  const off = cbuf('capeOff', n);
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
    const tx = pts[i1 * 2] - pts[i0 * 2], ty = pts[i1 * 2 + 1] - pts[i0 * 2 + 1], d = Math.hypot(tx, ty) || 1;
    const k = 2.6 * (i / (n - 1));
    off[i * 2] = pts[i * 2] + (-ty / d) * k; off[i * 2 + 1] = pts[i * 2 + 1] + (tx / d) * k;
    WS[i] *= 0.92;
  }
  ribbonPath(c, off, n, WS, false);
  const ex = off[(n - 1) * 2], ey = off[(n - 1) * 2 + 1];
  c.fillStyle = grad(off[0] - 8, off[1], ex + 8, ey, cp.c, 1); c.fill(); outline(cp.c, 0.8);
  if (!G.tint) {
    // 주름
    c.strokeStyle = ra(sh(cp.c, -0.5), 0.55); c.lineWidth = 0.7;
    for (const fo of [-0.45, 0.15, 0.55]) {
      c.beginPath();
      for (let i = 1; i < n; i++) {
        const i0 = i - 1, tx = off[i * 2] - off[i0 * 2], ty = off[i * 2 + 1] - off[i0 * 2 + 1], d = Math.hypot(tx, ty) || 1;
        const x = off[i * 2] + (-ty / d) * WS[i] * fo, y = off[i * 2 + 1] + (tx / d) * WS[i] * fo;
        if (i === 1) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    // 밑단 장식
    c.strokeStyle = cp.style === 'royal' ? '#e8c872' : ra(sh(cp.c2, 0.2), 0.9); c.lineWidth = 0.9;
    c.beginPath(); const e = (n - 1) * 2, tx = off[e] - off[e - 2], ty = off[e + 1] - off[e - 1], d = Math.hypot(tx, ty) || 1;
    c.moveTo(off[e] + (-ty / d) * WS[n - 1], off[e + 1] + (tx / d) * WS[n - 1]); c.lineTo(off[e] - (-ty / d) * WS[n - 1], off[e + 1] - (tx / d) * WS[n - 1]); c.stroke();
    if (cp.style === 'tattered') {
      c.fillStyle = sh(cp.c, -0.1);
      for (let k = 0; k < 3; k++) { const u = (k + 0.5) / 3 * 2 - 1; const bx = off[e] + (-ty / d) * WS[n - 1] * u, by = off[e + 1] + (tx / d) * WS[n - 1] * u; c.beginPath(); c.moveTo(bx - 1.6, by); c.lineTo(bx + (tx / d) * 4.5, by + (ty / d) * 4.5); c.lineTo(bx + 1.6, by); c.fill(); }
    }
  }
}
function drawMantle(s, K) {
  const cp = K.cape;
  if (!cp) return;
  const c = G.c;
  sp(s, K, 0.96, -0.6);
  c.save(); c.translate(QX, QY); c.rotate(Math.atan2(s.fy, s.fx));
  c.beginPath(); c.moveTo(-6.8 * K.hW, -1.8); c.quadraticCurveTo(0, -4.2, 6.2 * K.hW, -1.2); c.quadraticCurveTo(7.2 * K.hW, 2.2, 5.4 * K.hW, 4.4); c.quadraticCurveTo(-1, 6, -7.4 * K.hW, 3.4); c.closePath();
  c.fillStyle = grad(-7, -3, 7, 4, cp.c, 1); c.fill(); outline(cp.c, 0.7);
  if (!G.tint) {
    c.strokeStyle = cp.c2; c.lineWidth = 0.8; c.beginPath(); c.moveTo(5.4 * K.hW, 4.4); c.quadraticCurveTo(-1, 6, -7.4 * K.hW, 3.4); c.stroke();
    gem(4.6 * K.hW, -0.4, 1.3, K.o === 'noble' ? '#ff2a44' : '#e8c872');
  }
  c.restore();
}
function drawCollar(s, K, back) {
  const c = G.c, o = K.o;
  if (o === 'noble') {
    const bx = s.nx - s.fx * 2.4, by = s.ny - s.fy * 2.4;
    if (back) {
      c.save(); c.translate(bx, by); c.rotate(Math.atan2(s.fy, s.fx) + 0.1);
      c.beginPath(); c.moveTo(1.2, 1.2); c.quadraticCurveTo(-1.8, -6, -3.8, -12.2); c.quadraticCurveTo(-5.4, -7, -6.4, 0.4); c.quadraticCurveTo(-3, 2.6, 1.2, 1.2); c.closePath();
      c.fillStyle = grad(-6, -6, 1, -2, K.pr, 1); c.fill(); outline(K.pr, 0.7);
      if (!G.tint) { c.beginPath(); c.moveTo(0.4, 0.6); c.quadraticCurveTo(-2, -5.4, -3.6, -10.6); c.quadraticCurveTo(-4.2, -5, -3.8, 0.8); c.closePath(); c.fillStyle = K.se; c.fill(); c.strokeStyle = K.tr; c.lineWidth = 0.6; c.beginPath(); c.moveTo(1.2, 1.2); c.quadraticCurveTo(-1.8, -6, -3.8, -12.2); c.stroke(); }
      c.restore();
    } else if (!G.tint) { // 크라바트
      const x = s.nx + s.fx * 2.2, y = s.ny + s.fy * 2.2 + 1;
      c.fillStyle = '#ece6e0';
      c.beginPath(); c.moveTo(x - 1, y - 1.6); c.quadraticCurveTo(x + 3.4, y + 1, x + 1.2, y + 5.6); c.quadraticCurveTo(x - 0.6, y + 3, x - 1.6, y + 1); c.closePath(); c.fill(); outline('#ece6e0', 0.5);
      gem(x + 1, y + 0.8, 1, '#ff2a44');
    }
    return;
  }
  if (back) return;
  if (G.tint) return;
  if (o === 'hunter' || o === 'gunslinger' || o === 'merchant') { // 세운 깃
    const bx = s.nx - s.fx * 1.6 + s.ux * 0.5, by = s.ny - s.fy * 1.6 + s.uy * 0.5;
    c.save(); c.translate(bx, by); c.rotate(Math.atan2(s.fy, s.fx));
    c.beginPath(); c.moveTo(-3.6, 1.6); c.lineTo(-4.2, -4.4); c.quadraticCurveTo(-1, -2.6, 2.2, -2); c.lineTo(4.6, 1.2); c.quadraticCurveTo(0, 3.2, -3.6, 1.6); c.closePath();
    c.fillStyle = grad(-4, -4, 4, 2, K.pr, 1); c.fill(); outline(K.pr, 0.6);
    c.strokeStyle = o === 'hunter' ? K.se : K.tr; c.lineWidth = 0.5; c.stroke();
    c.restore();
  } else if (o === 'priest') {
    const x = s.nx + s.fx * 2, y = s.ny + s.fy * 2;
    c.fillStyle = '#f4f0ea'; c.fillRect(x - 1, y - 1.6, 2, 1.8);
  }
}

// ───────────────────────── 효과 ─────────────────────────
const TN = 13;
const TRX0 = new Float32Array(TN + 1), TRY0 = new Float32Array(TN + 1), TRX1 = new Float32Array(TN + 1), TRY1 = new Float32Array(TN + 1);
const TRXM = new Float32Array(TN + 1), TRYM = new Float32Array(TN + 1), TRXE = new Float32Array(TN + 1), TRYE = new Float32Array(TN + 1);
/** 점열을 중점 2차 곡선으로 잇기 (정방향) */
function curveFwd(c, X, Y, n, move) {
  if (move) c.moveTo(X[0], Y[0]); else c.lineTo(X[0], Y[0]);
  for (let i = 1; i < n - 1; i++) c.quadraticCurveTo(X[i], Y[i], (X[i] + X[i + 1]) / 2, (Y[i] + Y[i + 1]) / 2);
  c.lineTo(X[n - 1], Y[n - 1]);
}
/** 역방향 */
function curveBack(c, X, Y, n) {
  c.lineTo(X[n - 1], Y[n - 1]);
  for (let i = n - 2; i > 0; i--) c.quadraticCurveTo(X[i], Y[i], (X[i] + X[i - 1]) / 2, (Y[i] + Y[i - 1]) / 2);
  c.lineTo(X[0], Y[0]);
}
/** 초승달 궤적 3겹(색 번짐 → 밝은 심 → 흰 칼날선). 바깥=TRX1, 안쪽=TRX0/TRXM/TRXE.
 *  오래된 끝은 투명하게: 기본은 현(시작→끝) 방향 선형 그라디언트, cone 이 있으면 원뿔(각도) 그라디언트 */
const CONE = { on: false, a0: 0, span: 0 };
function crescent(c, n, tc, a) {
  const core = mx(tc, '#ffffff', 0.3);
  const gx0 = TRX1[0], gy0 = TRY1[0], gx1 = TRX1[n - 1], gy1 = TRY1[n - 1];
  const cone = CONE.on && typeof c.createConicGradient === 'function';
  const lin = !cone && Math.abs(gx1 - gx0) + Math.abs(gy1 - gy0) >= 4;
  const fill = (col, a0, am, a1) => {
    let g;
    if (cone) {
      const f = clamp(CONE.span / TAU, 0.05, 0.999);
      g = c.createConicGradient(CONE.a0, 0, 0);
      g.addColorStop(0, ra(col, a0)); g.addColorStop(f * 0.55, ra(col, am)); g.addColorStop(f, ra(col, a1)); g.addColorStop(Math.min(1, f + 0.001), ra(col, 0));
    } else if (lin) {
      g = c.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, ra(col, a0)); g.addColorStop(0.55, ra(col, am)); g.addColorStop(1, ra(col, a1));
    } else return ra(col, a1 * 0.8);
    return g;
  };
  c.fillStyle = fill(tc, 0, 0.3 * a, 0.62 * a);
  c.beginPath(); curveFwd(c, TRX1, TRY1, n, true); curveBack(c, TRX0, TRY0, n); c.closePath(); c.fill();
  c.fillStyle = fill(core, 0.05 * a, 0.45 * a, 0.85 * a);
  c.beginPath(); curveFwd(c, TRX1, TRY1, n, true); curveBack(c, TRXM, TRYM, n); c.closePath(); c.fill();
  c.fillStyle = fill('#ffffff', 0.15 * a, 0.8 * a, 1 * a);
  c.beginPath(); curveFwd(c, TRX1, TRY1, n, true); curveBack(c, TRXE, TRYE, n); c.closePath(); c.fill();
}
function trailColor(K, mv) {
  const el = mv.element || K.W.element;
  return mv.slash?.color || (el ? EL_COL[el] : K.trailC);
}
/** 무기 궤적: 과거 시점 자세를 다시 풀어 칼끝이 쓸고 간 초승달(최신일수록 두껍게)을 그린다. 판정 상자까지 닿도록 연장 */
function drawTrail(E, K, p, mv, which) {
  if (G.tint || !G.fx) return;
  const ph = phaseAt(mv, ST.t);
  const t = ph.t, h0 = ph.h0, h1 = ph.h1;
  const fade = t > h1 ? 1 - (t - h1) / 0.09 : 1;
  if (t < h0 - 0.004 || fade <= 0) return;
  const win = mv.finisher ? 0.12 : 0.085;
  const tEnd = Math.min(t, h1 + 0.015), tStart = Math.max(h0 - 0.015, t - win);
  if (tEnd <= tStart + 0.003) return;
  const L = weaponReach(K.W);
  let ext = 0;
  if (mv.box) {
    const reach = 1 + ((p.stats?.reach ?? 0) / 100);
    const bx = (mv.box.x + mv.box.w * (mv.box.x >= 0 ? reach : 1)) / E.hs, by = (mv.box.y + mv.box.h * 0.5) / E.hs;
    const need = Math.hypot(bx - SK.s1x, by - SK.s1y) * 0.92;
    ext = clamp(need - (K.ua + K.fa + L), 0, 64);
  }
  const Ro = L + ext;
  const wmax = clamp(Ro * (K.W.type === 'greatsword' ? 0.6 : K.W.type === 'dagger' ? 0.7 : 0.52), 9, 50) * (mv.finisher ? 1.15 : 1);
  const n = TN;
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), tk = lerp(tStart, tEnd, u);
    resetPose(PT); attackPose(PT, ST2, p, K, mv, tk);
    solveUpper(PT, K, SK2);
    const hx = which === 2 ? SK2.h2x : SK2.h1x, hy = which === 2 ? SK2.h2y : SK2.h1y, w = which === 2 ? PT.w2 : PT.w1;
    const cw = Math.cos(w), sw = Math.sin(w);
    const wk = wmax * Math.pow(u, 1.3);
    tx0(PT, hx + cw * Ro, hy + sw * Ro); TRX1[k] = TX; TRY1[k] = TY;
    tx0(PT, hx + cw * (Ro - wk * 0.12), hy + sw * (Ro - wk * 0.12)); TRXE[k] = TX; TRYE[k] = TY;
    tx0(PT, hx + cw * (Ro - wk * 0.42), hy + sw * (Ro - wk * 0.42)); TRXM[k] = TX; TRYM[k] = TY;
    tx0(PT, hx + cw * (Ro - wk), hy + sw * (Ro - wk)); TRX0[k] = TX; TRY0[k] = TY;
  }
  const c = G.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  crescent(c, n, trailColor(K, mv), fade * (mv.finisher ? 1.15 : 1));
  // 칼끝 섬광
  glow(TRX1[n - 1], TRY1[n - 1], 10 + wmax * 0.25, mx(trailColor(K, mv), '#ffffff', 0.5), 0.5 * fade);
  c.restore();
}
/** 회전 베기(가로) 궤적: 납작한 원 위의 초승달 + 옅은 전체 고리 */
function drawSpinTrail(E, K, p, mv, R, cy) {
  if (G.tint || !G.fx) return;
  if (!(ST.ph === 1 || (ST.ph === 2 && ST.u < 0.25))) return;
  const c = G.c, th = ST.th, fade = ST.ph === 2 ? 1 - ST.u / 0.25 : 1;
  const tc = trailColor(K, mv);
  const span = Math.min(th + 0.25, 3.8), wmax = R * 0.42, n = TN;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.translate(0, cy); c.scale(1, 0.3);
  c.strokeStyle = ra(tc, 0.12 * fade); c.lineWidth = wmax * 0.35;
  c.beginPath(); c.arc(0, 0, R - wmax * 0.3, 0, TAU); c.stroke();
  for (let k = 0; k < n; k++) {
    const u = k / (n - 1), a = th - span * (1 - u), wk = wmax * Math.pow(u, 1.2), ca = Math.cos(a), sa = Math.sin(a);
    TRX1[k] = ca * R; TRY1[k] = sa * R;
    TRXE[k] = ca * (R - wk * 0.12); TRYE[k] = sa * (R - wk * 0.12);
    TRXM[k] = ca * (R - wk * 0.42); TRYM[k] = sa * (R - wk * 0.42);
    TRX0[k] = ca * (R - wk); TRY0[k] = sa * (R - wk);
  }
  CONE.on = true; CONE.a0 = th - span; CONE.span = span;
  crescent(c, n, tc, fade * 1.15);
  CONE.on = false;
  c.restore();
}
/** 찌르기 섬광: 칼끝에서 판정 끝까지 뻗는 창 모양 빛 + 흰 심 */
function drawStreak(E, K, p, mv, which) {
  if (G.tint || !G.fx || ST.ph !== 1 || !mv.box) return;
  const reach = 1 + ((p.stats?.reach ?? 0) / 100);
  const s = SK, P = E.P;
  const hx = which === 2 ? s.h2x : s.h1x, hy = which === 2 ? s.h2y : s.h1y, w = which === 2 ? P.w2 : P.w1;
  const L = weaponReach(K.W);
  tx0(P, hx + Math.cos(w) * L * 0.6, hy + Math.sin(w) * L * 0.6); const x0 = TX, y0 = TY;
  const x1 = (mv.box.x + mv.box.w * reach) / E.hs;
  if (x1 <= x0 + 4) return;
  const k = 1 - ST.u * 0.7, tc = trailColor(K, mv), hw = mv.finisher || mv.lunge > 300 ? 4.2 : 3;
  const c = G.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  let g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, ra(tc, 0)); g.addColorStop(0.25, ra(tc, 0.55 * k)); g.addColorStop(1, ra(tc, 0.1 * k));
  c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0 - hw * 0.4); c.quadraticCurveTo(lerp(x0, x1, 0.55), y0 - hw, x1, y0); c.quadraticCurveTo(lerp(x0, x1, 0.55), y0 + hw, x0, y0 + hw * 0.4); c.closePath(); c.fill();
  g = c.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, ra('#ffffff', 0.2 * k)); g.addColorStop(0.5, ra('#ffffff', 0.95 * k)); g.addColorStop(1, ra('#ffffff', 0));
  c.fillStyle = g; c.beginPath(); c.moveTo(x0, y0 - 0.6); c.lineTo(x1, y0); c.lineTo(x0, y0 + 0.6); c.closePath(); c.fill();
  // 속도선
  c.strokeStyle = ra(tc, 0.45 * k); c.lineWidth = 0.6;
  c.beginPath();
  for (let i = 0; i < 3; i++) { const yy = y0 + (i - 1) * (hw + 2.5), xs = lerp(x0, x1, 0.15 + 0.2 * h01(i + Math.floor(ST.t * 60))); c.moveTo(xs, yy); c.lineTo(lerp(xs, x1, 0.7), yy); }
  c.stroke();
  glow(x1 - 4, y0, 12, tc, 0.55 * k);
  c.restore();
}

// 채찍 끈 점 계산 (T0 로컬)
const LASH = new Float32Array(48);
const LASH_N = 20;
function lashPoints(E, K, p, mv, kind, tq, outBuf) {
  const P = E.P, s = SK;
  const W = K.W;
  // 손잡이 끝
  const hl = 10;
  tx0(P, s.h1x + Math.cos(P.w1) * hl, s.h1y + Math.sin(P.w1) * hl);
  const Hx = TX, Hy = TY;
  const reach = 1 + ((p.stats?.reach ?? 0) / 100);
  const box = mv.box || { x: 12, y: -66, w: 150, h: 26 };
  const hs = E.hs;
  const n = LASH_N;
  const ph = phaseAt(mv, tq);
  if (kind === 4) {
    // 회전: 3D 원 궤도 투영
    const R = (box.w * 0.5 * reach) / hs, cyy = (box.y + box.h * 0.5) / hs;
    const th = ph.ph === 1 ? ST.th : ph.ph === 0 ? -0.6 * ph.u : ST.th;
    const Lr = ph.ph === 2 ? R * (1 - 0.7 * ease.inOutQuad(ph.u)) : R;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = th - 0.9 * Math.pow(u, 1.2);
      let x = Math.cos(a) * Lr * u, y = cyy + Math.sin(a) * Lr * u * 0.22 + u * 3;
      if (ph.ph === 2) y += u * u * 30 * ph.u;
      const k = Math.min(1, u * 6);
      outBuf[i * 2] = lerp(Hx, x, k); outBuf[i * 2 + 1] = lerp(Hy, y, k);
    }
    return n;
  }
  let Tx, Ty;
  if (kind === 2) { Tx = (box.x + box.w * 0.5) / hs; Ty = box.y / hs; }
  else if (kind === 3) { Tx = (box.x + box.w * 0.5) / hs + Math.sin(tq * 30) * 10; Ty = (box.y + box.h) / hs; }
  else { Tx = (box.x + box.w * (box.x >= 0 ? reach : 1)) / hs; Ty = (box.y + box.h * (ST.atk?.ty ?? 0.5)) / hs; }
  let dx = Tx - Hx, dy = Ty - Hy;
  const L = Math.max(30, Math.hypot(dx, dy));
  dx /= L; dy /= L;
  const nx = dy, ny = -dx; // 위쪽 법선
  const upx = ny < 0 ? nx : -nx, upy = ny < 0 ? ny : -ny;
  if (ph.ph === 0) {
    // 예비: 손잡이 뒤로 끌리는 끈
    const l0 = lerp(24, L * 0.4, ph.u);
    let a = P.w1, x = Hx, y = Hy;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      outBuf[i * 2] = x; outBuf[i * 2 + 1] = y;
      a += 0.09 + u * 0.05; x += Math.cos(a) * (l0 / (n - 1)); y += Math.sin(a) * (l0 / (n - 1)) + u * 0.8;
    }
    return n;
  }
  if (ph.ph === 1) {
    // 풀려나가는 고리
    const e = ease.outCubic(clamp(ph.u * 1.55, 0, 1));
    const ls = e * L, ll = L - ls, rho = Math.max(0.4, ll / PI);
    const wave = (1 - e) * 5;
    for (let i = 0; i < n; i++) {
      const sLen = (i / (n - 1)) * L;
      let x, y;
      if (sLen <= ls) {
        const w = Math.sin((sLen / Math.max(1, ls)) * PI) * wave + Math.sin(sLen * 0.12 - tq * 60) * (1 - e * 0.7) * 1.2 * (sLen / L);
        x = Hx + dx * sLen + upx * w; y = Hy + dy * sLen + upy * w;
      } else {
        const sg = sLen - ls, a = sg / rho;
        x = Hx + dx * (ls + rho * Math.sin(a)) + upx * rho * (1 - Math.cos(a));
        y = Hy + dy * (ls + rho * Math.sin(a)) + upy * rho * (1 - Math.cos(a));
      }
      outBuf[i * 2] = x; outBuf[i * 2 + 1] = y;
    }
    return n;
  }
  // 회수: 힘이 빠지며 처짐
  const u = ph.u, Lr = L * (1 - 0.72 * ease.inOutQuad(u));
  for (let i = 0; i < n; i++) {
    const v = i / (n - 1), sLen = v * Lr;
    let x = Hx + dx * sLen * (1 - 0.25 * u), y = Hy + dy * sLen * (1 - 0.25 * u);
    y += v * v * 34 * ease.outQuad(u) * (kind === 3 ? 0.2 : 1);
    x += Math.sin(v * 5 - u * 8) * 2.5 * u;
    if (y > -0.6 && p.onGround !== false) y = -0.6;
    outBuf[i * 2] = x; outBuf[i * 2 + 1] = y;
  }
  return n;
}
/** 모아베기 채찍: 머리 위 올가미 */
function lassoPoints(E, K, outBuf, t) {
  const P = E.P, s = SK;
  tx0(P, s.h1x + Math.cos(P.w1) * 10, s.h1y + Math.sin(P.w1) * 10);
  const Hx = TX, Hy = TY, n = LASH_N, R = 22 + ST.charge * 10;
  const th = t * (10 + ST.charge * 8);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = th - u * 2.4;
    const x = Math.cos(a) * R * Math.min(1, u * 3), y = Hy - 6 + Math.sin(a) * R * 0.25 * Math.min(1, u * 3);
    const k = Math.min(1, u * 4);
    outBuf[i * 2] = lerp(Hx, x + Hx * 0.3, k); outBuf[i * 2 + 1] = lerp(Hy, y, k);
  }
  return n;
}

// ───────────────────────── 확장 훅 (다른 작업 패키지가 등록) ─────────────────────────
// 등록 전에는 모두 null → 아무 일도 하지 않는다. 등록: import { registerHeroHooks } from './hero.js' (또는 heroHooks 직접 대입).
//  gait(P, K, anim, p, at)        docs/specs/feel.md WP1: hero_gait.js 의 gaitPose. gaitAnims[anim] 가 있는 애니메이션
//                                  (walk sprint run_start skid pivot land_heavy)을 받아 자세 P 를 채운다. 무기 쥐는 법은
//                                  hero.js 가 holdFor(P, K, gaitAnims[anim]) 로 이어서 적용 ('run'|'dash'|'idle').
//  gaitAnims {anim: holdMode}     위 애니메이션 목록. 'run' 은 p.gaitPh(숫자)가 있으면 그것을 달리기 위상으로 쓴다.
//  blend(anim, prevKey) → 초|undefined   애니메이션 전환 블렌드 시간 덮어쓰기 (예: skid 0.06, walk↔run 0.12)
//  feel(P, p, K) → {tint, a}|void  feel overlay: 블렌드 뒤·골격 풀이 전에 호출. P.sq/P.lean 등을 곱·더해 찌그러짐·기울기를
//                                  주고(applyFeelOverlay), 색 섬광이 필요하면 {tint:'#fff', a:0~1} 를 돌려준다(몸 실루엣에 가산).
//  rider(P, K, p, ride, hs) → {cx, bottom, skipFarLeg}|null   docs/specs/companions.md C6 §11.4: p.ride 가 있을 때
//                                  자세를 앉은 자세로 강제하고, 골반이 안장(ride.sx, ride.sy)에 오도록 원점을 돌려준다.
//                                  skipFarLeg=true 면 먼 다리를 그리지 않는다(탈것 몸통 뒤).
export const heroHooks = { gait: null, gaitAnims: null, blend: null, feel: null, rider: null };
// feel.md 3.3.3 블렌드: skid·pivot·land_heavy 0.06초, walk↔run↔sprint 0.12초 (그 밖은 undefined → 기본값)
const WRS = new Set(['walk', 'run', 'sprint']);
function gaitBlend(anim, prev) {
  if (anim === 'skid' || anim === 'pivot' || anim === 'land_heavy') return 0.06;
  if (WRS.has(anim) && WRS.has(prev)) return 0.12;
  return undefined;
}

// ── 탈것 기수 (docs/specs/companions.md §11.4, WP C6) ──
// p.ride = {sx, sy(안장점, 월드), lean, duck(0~1), footY(골반 아래 등자 깊이 px), legs:'straddle'|'kneel', reins, gait, phase}
/** 기수 전용 애니메이션: ride(앉은 대기·고삐) · ride_duck · ride_charge(창처럼 앞으로) · ride_rear(무기 든 팔을 들어 올림) · ride_hurt */
function rideAnim(P, K, anim, at, tt) {
  if (anim === 'ride_hurt') { poseHurt(P, at); P.w1 = P.a1 + 0.8; P.w2 = P.a2 + 0.8; ST.hurt = clamp(1 - at / 0.12, 0, 1); return; }
  poseIdle(P, K, tt, false); holdFor(P, K, 'idle');
  if (anim === 'ride_charge') { P.lean += 0.45; P.hd -= 0.2; P.a1 = -0.05; P.r1 = 0.96; P.w1 = -0.04; }
  else if (anim === 'ride_rear') { P.lean -= 0.3; P.hd += 0.12; P.a1 = -1.9; P.r1 = 0.9; P.w1 = -1.55; }
}
/** 앉은 자세 강제 + 골반이 안장점에 오도록 원점 계산. 반환 {cx, bottom, skipFarLeg} */
const RIDE_O = { cx: 0, bottom: 0, skipFarLeg: true };
function riderPose(P, K, p, ride, hs) {
  const ls = K.ls || 1, duck = clamp(ride.duck ?? 0, 0, 1), kneel = ride.legs === 'kneel';
  P.px = 0; P.py = -41; P.rot = 0; P.sx = 1; P.ox = 0; P.sq = 1; P.pvy = -46;
  P.lean = clamp(P.lean, -0.35, 0.6) + (ride.lean ?? 0) + 0.6 * duck;
  P.hd += 0.25 * duck;
  const fy = -41 + (ride.footY ?? 18) / (ls * hs);             // 등자 깊이(월드 px) → 자세 단위
  P.f1x = kneel ? 5 : 7; P.f1y = fy; P.f2x = kneel ? 1 : 3; P.f2y = fy - 2;
  P.t1 = P.t2 = kneel ? 0.9 : 0.6;
  // 빈손은 고삐 (공격·시전·투척·양손 무기 중이 아닐 때)
  const busy = p.move || p.anim === 'cast' || p.anim === 'throw' || p.anim === 'ride_hurt' || P.two || K.off;
  if (ride.reins !== false && !busy) { P.a2 = 0.62; P.r2 = 0.78; P.e2 = 1; }
  RIDE_O.cx = ride.sx; RIDE_O.bottom = ride.sy + 41 * ls * hs;
  return RIDE_O;
}
/** 천 물리(망토·머리카락)가 기수 원점에서 돌도록 p 를 대신하는 객체 */
const RIDE_P = {};
function rideProxy(p, o) { Object.assign(RIDE_P, p); RIDE_P.cx = o.cx; RIDE_P.bottom = o.bottom; return RIDE_P; }
export function registerHeroHooks(h) { Object.assign(heroHooks, h); return heroHooks; }

/** 게임 속 플레이어 영웅 그리기 배율 (판정 상자는 그대로). 채색 퍼펫의 가독성 기준으로 정함 — docs/art/PUPPET_PIPELINE.md */
export const HERO_DRAW_SCALE = 1.14;
let drawScale = HERO_DRAW_SCALE;
/** 테스트·옵션용: 플레이어 그리기 배율 바꾸기 (판정 상자와 무관) */
export function setHeroDrawScale(v) { drawScale = v > 0 ? v : HERO_DRAW_SCALE; }
/** 턴테이블 계약 (docs/specs/platform.md §7.3): 8방향 스냅 + 사이 구간은 가로 압축 교차 */
export const HERO_VIEW = { continuous: false, steps: 8, painted: true };
/** 이 엔티티가 턴테이블에서 채색 8방향을 쓰는가 (false 면 옆모습 카드 뒤집기 대체) */
export function heroViewInfo(p) {
  const look = p?.look;
  const I = look ? PUP.puppetFor(p, look) : null;
  return { painted: !!(I && PUP.turnReady(I)), steps: HERO_VIEW.steps, continuous: HERO_VIEW.continuous };
}
function heroScale(p, world, opts, look, K) {
  const base = opts.scale ?? (world && !p.npc && PUP.isPlayable(p.ch?.id) ? drawScale : 1);
  return base * (look.height ?? K.defH);
}

// ───────────────────────── 잔상 합성 ─────────────────────────
const POOL = [];
let poolTick = 0;
// 합성 풀 10장을 모듈 초기화 때 미리 만든다 (MASTER_PLAN §5.2: 스테이지 시작 뒤 새 캔버스 0 — 첫 잔상·각성 컷인 섬광이
// 캔버스를 만들지 않게). 크기 0 으로 두고 쓸 때 키운다(메모리는 쓰는 만큼만)
if (typeof document !== 'undefined') for (let i = 0; i < 10; i++) POOL.push({ cv: document.createElement('canvas'), key: null, tick: 0, rs: 0 });
function poolGet(key, W, H) {
  poolTick++;
  let best = null;
  for (const e of POOL) { if (key && e.key === key) { e.tick = poolTick; return e; } }
  if (POOL.length < 10) { best = { cv: document.createElement('canvas'), key: null, tick: 0, rs: 0 }; POOL.push(best); }
  else { best = POOL[0]; for (const e of POOL) if (e.tick < best.tick) best = e; }
  best.key = key; best.tick = poolTick; best.rs = 0;
  if (best.cv.width < W || best.cv.height < H) { best.cv.width = Math.max(best.cv.width, W); best.cv.height = Math.max(best.cv.height, H); }
  return best;
}
function drawComposite(ctx, p, world, opts, K) {
  const m = ctx.getTransform();
  const sc = Math.hypot(m.a, m.b) || 1;
  const rs = Math.min(sc, opts.tint ? 1.5 : 2.5);
  const hs = heroScale(p, world, opts, p.look || DEF_LOOK, K);
  const bw = 130 * hs, bt = 150 * hs, bb = 24 * hs;
  const W = Math.ceil(2 * bw * rs), H = Math.ceil((bt + bb) * rs);
  const key = p.snapshot ? p : null;
  const e = poolGet(key, W, H);
  if (!key || Math.abs(e.rs - rs) > 0.05 || e.tint !== opts.tint || e.pk !== K.pupKey) {
    const oc = e.cv.getContext('2d');
    oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, W + 2, H + 2);
    oc.setTransform(rs, 0, 0, rs, (bw - p.cx) * rs, (bt - p.bottom) * rs);
    drawHero(oc, p, world, { tint: opts.tint, scale: opts.scale, noFx: opts.noFx, _inner: true });
    if (opts.tint && K.pup) { // 채색 퍼펫은 부품이 그림이라 단색 잔상은 실루엣을 통째로 물들인다
      oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalCompositeOperation = 'source-in';
      oc.fillStyle = opts.tint; oc.fillRect(0, 0, W + 2, H + 2); oc.globalCompositeOperation = 'source-over';
    }
    e.rs = rs; e.tint = opts.tint; e.pk = K.pupKey;
  }
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = clamp(opts.alpha, 0, 1);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(e.cv, 0, 0, W, H, p.cx - bw, p.bottom - bt, 2 * bw, bt + bb);
  ctx.restore();
  // 그리기 상태 복구 (중첩 호출로 G 가 바뀌었을 수 있음)
}

// ───────────────────────── 턴테이블 (opts.yaw) ─────────────────────────
const TT_SIDE = {};
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
/** 옆모습(퍼펫/벡터)을 facing·가로 배율로 그린다 */
function drawProfile(ctx, p, world, opts, facing, sx, alpha) {
  if (alpha <= 0.002) return;
  Object.assign(TT_SIDE, p); TT_SIDE.facing = facing; TT_SIDE.rig = p.rig;
  ctx.save();
  if (sx !== 1) { ctx.translate(p.cx, p.bottom); ctx.scale(sx, 1); ctx.translate(-p.cx, -p.bottom); }
  const a = (opts.alpha ?? 1) * alpha;
  drawHero(ctx, TT_SIDE, world, { scale: opts.scale, noFx: opts.noFx, rim: opts.rim, tint: opts.tint, alpha: a < 0.995 ? a : undefined, _turn: true });
  ctx.restore();
}
function drawHeroYaw(ctx, p, world, opts, K, look) {
  let yaw = Math.atan2(Math.sin(opts.yaw), Math.cos(opts.yaw));
  const cs = Math.cos(yaw);
  const I = K.pup;
  const posed = (p.anim && p.anim !== 'idle') || p.move;
  if (!I || !PUP.turnReady(I) || posed) {
    // 대체(벡터·로딩 중·동작 시연): 옆모습 카드 뒤집기 — facing = sign(cos), 가로 배율 = |cos|
    drawProfile(ctx, p, world, opts, cs >= 0 ? 1 : -1, Math.max(posed ? 0.35 : 0.12, Math.abs(cs)), 1);
    return;
  }
  const tt = p.t ?? world?.time ?? performance.now() / 1000;
  const hs = heroScale(p, world, opts, look, K);
  const deg = (yaw * 180) / PI, stepF = deg / 45, i0 = Math.floor(stepF), f = stepF - i0;
  const norm = (d) => { d = ((d + 180) % 360 + 360) % 360 - 180; return d === -180 ? 180 : d; };
  const d0 = norm(i0 * 45), d1 = norm((i0 + 1) * 45);
  const k = smooth01((f - 0.42) / 0.16);                // 가운데 16% 에서만 교차 (겹쳐 보이는 구간 최소화)
  const sq = 1 - 0.24 * Math.sin(PI * f);               // 돌아가는 느낌의 가로 압축 (중간에서 가장 좁음)
  const views = [[d0, 1 - k], [d1, k]];
  G.c = ctx; G.tint = opts.tint || null; G.t = tt; G.fx = !opts.tint && !opts.noFx; G.olw = 0.85;
  const aBase = opts.alpha ?? 1;
  // 옆모습(0°/180°)은 게임 퍼펫이 자기 망토·날개·무기를 그린다 → 턴테이블용 망토·날개·무기는 채색 뷰의 비중만큼만
  const wPaint = views.reduce((a, [d, w]) => a + (d === 0 || d === 180 ? 0 : w), 0);
  // 1) 뒤 효과: 오라 · (앞모습) 망토 · (앞모습) 날개 · 몸에 가려지는 쪽 무기
  ctx.save(); ctx.translate(p.cx, p.bottom); ctx.scale(hs, hs);
  if (G.fx && K.aura) glow(0, -44, 46, K.auraC, (0.2 + 0.06 * Math.sin(tt * 3)) * K.auraK);
  ctx.globalAlpha = aBase * wPaint;
  if (wPaint > 0.002) {
    PUP.drawTurnWings(ctx, I, K.wings, yaw, false, tt);
    PUP.drawTurnCape(ctx, I, K.cape, yaw, true, tt);
    PUP.drawTurnWeapon(ctx, I, K.W, yaw, false, tt);
  }
  ctx.restore();
  // 2) 몸: 옆모습(0°/180°)은 게임과 같은 퍼펫, 나머지는 채색 뷰
  // 교차: 앞 스텝을 먼저, 뒤 스텝을 위에 — 불투명도 min(1, 2·가중치). 둘 다 반투명해져 배경이 비치는 '유령' 구간이 없고 k 에 연속
  for (const [d, w0] of views) {
    const w = Math.min(1, 2 * w0);
    if (w0 <= 0.002) continue;
    if (d === 0 || d === 180) { drawProfile(ctx, p, world, opts, d === 0 ? 1 : -1, sq, w); continue; }
    ctx.save(); ctx.translate(p.cx, p.bottom); ctx.scale(hs, hs); ctx.globalAlpha = aBase;
    PUP.drawTurnStep(ctx, I, d, sq, w, tt);
    ctx.restore();
  }
  // 3) 앞 효과: (뒷모습) 망토 · 날개, 무기, 후광, 오라 입자
  ctx.save(); ctx.translate(p.cx, p.bottom); ctx.scale(hs, hs); ctx.globalAlpha = aBase * wPaint;
  G.c = ctx; G.tint = opts.tint || null; G.fx = !opts.tint && !opts.noFx; G.olw = 0.85;
  if (wPaint > 0.002) {
    PUP.drawTurnCape(ctx, I, K.cape, yaw, false, tt);
    PUP.drawTurnWings(ctx, I, K.wings, yaw, true, tt);
    PUP.drawTurnWeapon(ctx, I, K.W, yaw, true, tt);
  }
  ctx.globalAlpha = aBase;
  if (K.halo && G.fx) PUP.drawTurnHalo(ctx, K.aura?.color, tt, I);
  if (K.aura && G.fx) drawAuraMotes(K.aura.type || 'holy', K.auraC, K.auraK, K.auraK < 1 ? 5 : 8, 84);
  ctx.restore();
}
/**
 * 인벤토리 턴테이블 편의 함수 (docs/specs/platform.md WP-5). look 만으로 영웅을 yaw 방향으로 그린다.
 * (x, y) = 발 중앙, height = 발~정수리 화면 높이(px), t = 시간(초, 숨쉬기·천 흔들림)
 * opts: { charId | ch, classId?, anim?, rig?(천 물리 유지용 객체), alpha, noFx, rim }
 */
const TT_P = { cx: 0, bottom: 0, facing: 1, anim: 'idle', animT: 0, move: null, moveT: 0, atkSpeedMul: 1, vx: 0, vy: 0, onGround: true, rig: null, t: 0, stats: { reach: 0 }, charging: 0, muzzleT: 0 };
const TT_RIG = {};
export function drawHeroTurntable(ctx, look, yaw, x, y, height, t = 0, opts = {}) {
  const p = TT_P;
  p.look = opts.classId && !look.classId ? Object.assign(look, { classId: opts.classId }) : look;
  p.ch = opts.ch || PUP.charDef(opts.charId) || null;
  p.cx = x; p.bottom = y; p.t = t; p.animT = t; p.anim = opts.anim || 'idle'; p.rig = opts.rig || TT_RIG;
  drawHero(ctx, p, null, { yaw, scale: height / PUP.PUP_H, alpha: opts.alpha, noFx: opts.noFx, rim: opts.rim });
}

// ───────────────────────── 메인 ─────────────────────────
const E0 = { p: null, rig: null, hs: 1, fac: 1, dt: 0, P: null, K: null, skipFarLeg: false };
const P_TMP = newPose(), P_FROM = newPose();

export function drawHero(ctx, p, world, opts = {}) {
  if (!p) return;
  const look = p.look || DEF_LOOK;
  const K = specOf(look, p);
  if (opts.yaw !== undefined && !opts._turn && !opts._inner) { drawHeroYaw(ctx, p, world, opts, K, look); return; }
  if (!opts._inner && (opts.tint || (opts.alpha !== undefined && opts.alpha < 0.995))) { drawComposite(ctx, p, world, opts, K); return; }
  const hs = heroScale(p, world, opts, look, K);
  const fac = p.facing < 0 ? -1 : 1;
  const tt = p.t ?? world?.time ?? performance.now() / 1000;
  const rig = !opts._inner && p.rig && typeof p.rig === 'object' ? p.rig : null;
  let dt = 0;
  if (rig) { dt = rig.lastT === undefined ? 0 : clamp(tt - rig.lastT, 0, 0.05); rig.lastT = tt; }
  G.c = ctx; G.tint = opts.tint || null; G.t = tt; G.fx = !opts.tint && !opts.noFx;
  // ── 자세 ──
  const P = rig ? (rig.P || (rig.P = newPose())) : P_TMP;
  resetPose(P);
  Object.assign(ST, newST0);
  const anim = p.anim || 'idle';
  const at = p.animT ?? tt;
  const W = K.W;
  const mv = p.move || null;
  let akey = anim;
  if (mv) {
    const t = (p.moveT ?? 0) * (p.atkSpeedMul ?? 1);
    attackPose(P, ST, p, K, mv, t);
    akey = 'm:' + (mv.id || mv.anim);
    if (rig) { if (rig.mv !== mv || t < (rig.mvT ?? 0) - 0.001) { rig.mv = mv; akey += ':' + (rig.mvN = (rig.mvN || 0) + 1); } else akey += ':' + (rig.mvN || 0); rig.mvT = t; }
  } else {
    if (rig) rig.mv = null;
    switch (anim) {
      case 'run': {
        const spd = Math.abs(p.vx || 0), sp0 = p.ch?.move?.speed || 275;
        let ph;
        if (typeof p.gaitPh === 'number') ph = p.gaitPh;                       // WP1 보행 위상 (feel.md 3.3.1)
        else if (rig) { rig.runPh = (rig.runPh || 0) + dt * Math.max(spd, 60) / 18; ph = rig.runPh; } else ph = tt * 15;
        poseRun(P, K, ph, spd / sp0 || 0.8); holdFor(P, K, 'run');
        break;
      }
      case 'jump': case 'fall': poseAir(P, p.vy ?? 0); holdFor(P, K, 'air'); break;
      case 'flip': {
        poseAir(P, -200); holdFor(P, K, 'air');
        const u = clamp(at / 0.36, 0, 1), k = Math.sin(u * PI);
        P.rot = TAU * ease.outQuad(u); P.pvy = -48;
        P.f1x = lerp(P.f1x, 8, k); P.f1y = lerp(P.f1y, -27, k); P.f2x = lerp(P.f2x, 1, k); P.f2y = lerp(P.f2y, -22, k);
        P.a1 = lerp(P.a1, 0.8, k); P.r1 = lerp(P.r1, 0.62, k); P.a2 = lerp(P.a2, 1.0, k); P.r2 = lerp(P.r2, 0.6, k); P.lean = lerp(P.lean, 0.4, k);
        break;
      }
      case 'land': { poseIdle(P, K, tt, false); holdFor(P, K, 'idle'); const k = 1 - clamp(at / 0.14, 0, 1); P.py += 7 * k; P.sq = 1 - 0.07 * k; P.lean += 0.22 * k; P.f1x += 2 * k; P.f2x -= 2 * k; break; }
      case 'crouch': poseCrouch(P); holdFor(P, K, 'crouch'); break;
      case 'dash': {
        const type = p.ch?.move?.dash || 'dash';
        poseDash(P, type, at); holdFor(P, K, 'dash');
        ST.dash = type; ST.dashK = clamp(1 - at / 0.25, 0, 1);
        break;
      }
      case 'wall': poseWall(P); holdFor(P, K, 'air'); if (W.type === 'dagger') { P.w1 = HP + 0.6; P.w2 = HP + 0.8; } break;
      case 'hurt': poseHurt(P, at); P.w1 = P.a1 + 0.8; P.w2 = P.a2 + 0.8; ST.hurt = clamp(1 - at / 0.12, 0, 1); break;
      case 'death': poseDeath(P, at); if (K.pup) P.pvy -= 3.5; break; // 퍼펫은 몸통이 길어 누웠을 때 머리가 바닥에 묻히지 않게
      case 'throw': poseIdle(P, K, tt, false); holdFor(P, K, 'idle'); poseThrow(P, K, at); ST.throwK = W.type === 'whip' ? 1 : 2; break;
      case 'cast': poseIdle(P, K, tt, false); holdFor(P, K, 'idle'); poseCast(P, K, at, tt); ST.circle = clamp(at / 0.08, 0, 1) * (at < 0.3 ? 1 : clamp(1 - (at - 0.3) / 0.2, 0, 1)); ST.cast = 3; break;
      case 'charge': { ST.charge = clamp((p.charging ?? 0.3) / 0.55, 0, 1); poseCharge(P, K, ST.charge, tt); if (W.type === 'staff') ST.circle = ST.charge; break; }
      case 'ride': case 'ride_duck': case 'ride_charge': case 'ride_rear': case 'ride_hurt': rideAnim(P, K, anim, at, tt); break; // C6
      case 'talk': poseIdle(P, K, tt, true); holdFor(P, K, 'idle'); poseTalk(P, tt, 1); break;                                  // NPC 말하기
      case 'gesture': poseIdle(P, K, tt, true); holdFor(P, K, 'idle'); if (poseGesture(P, at % NPC_GEST, 1) > 0.35) ST.throwK = 1; break; // NPC 손짓 (편 손)
      default: {
        // WP1 (feel.md 3.3.3): walk/sprint/run_start/skid/pivot/land_heavy → hero_gait.js (heroHooks 로 덮어쓸 수 있음)
        const gm = heroHooks.gaitAnims?.[anim] ?? GAIT.GAIT_ANIMS?.[anim];
        if (gm) { (heroHooks.gait || GAIT.gaitPose)(P, K, anim, p, at); holdFor(P, K, typeof gm === 'string' ? gm : gm.hold || 'run'); break; }
        poseIdle(P, K, tt, !!p.npc); holdFor(P, K, 'idle');
        if (p.npc) npcLife(P, p, world, tt, rig, dt);   // 마을·스토리 NPC 대기: 자기 대사 중이면 말하기, 플레이어가 다가오면·가끔 손짓
        break;
      }
    }
  }
  // 애니메이션 전환 블렌드
  if (rig) {
    if (rig.akey !== akey) {
      if (rig.last) copyPose(rig.from || (rig.from = newPose()), rig.last);
      const hb = heroHooks.blend ? heroHooks.blend(anim, rig.akey) : gaitBlend(anim, rig.akey);
      rig.akey = akey; rig.bt = 0;
      rig.bd = hb ?? (mv ? 0.05 : anim === 'flip' || anim === 'hurt' ? 0.04 : anim === 'land' ? 0.05 : 0.1);
    }
    rig.bt = (rig.bt || 0) + dt;
    if (rig.from && rig.bt < rig.bd) blendPose(P, rig.from, ease.outQuad(rig.bt / rig.bd));
    copyPose(rig.last || (rig.last = newPose()), P);
  }
  // 확장 훅: 찌그러짐·기울기 오버레이(WP1) → 탈것 자세·원점(C6)
  const feel = heroHooks.feel ? heroHooks.feel(P, p, K) : (p.ride ? null : GAIT.applyFeelOverlay?.(P, p) || null);
  const ride = p.ride ? (heroHooks.rider || riderPose)(P, K, p, p.ride, hs) : null;
  solve(P, K, SK);
  LEG_T1 = P.t1; LEG_T2 = P.t2;
  E0.p = ride ? rideProxy(p, ride) : p; E0.rig = rig; E0.hs = hs; E0.fac = fac; E0.dt = dt; E0.P = P; E0.K = K; E0.skipFarLeg = !!ride?.skipFarLeg;
  swingOf(E0);
  ST.coil = W.type === 'whip' && !mv && anim !== 'charge';

  // ── 실루엣 패스: 역광 테두리(플레이어) · 피격 섬광 · feel 색 섬광 ──
  let flashK = ST.hurt > 0 && !G.tint ? ST.hurt : 0, flashCol = FLASH_COL;
  if (feel && feel.a > flashK && feel.tint && !G.tint) { flashK = clamp(feel.a, 0, 1); flashCol = feel.tint; }
  const wantRim = !opts._inner && G.fx && (opts.rim ?? !p.npc);
  const off = (wantRim || flashK > 0) && typeof document !== 'undefined';

  // ── 그리기 ──
  ctx.save();
  ctx.translate(ride ? ride.cx : p.cx, ride ? ride.bottom : p.bottom);
  ctx.scale(fac * hs, hs);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  G.olw = 0.85;
  const c = ctx;
  const E = E0;
  const mist = ST.dash === 'mist' && ST.dashK > 0;

  // 1) 뒤 광원·마법진
  if (G.fx) {
    if (K.aura) glow(0, -44, 46, K.auraC, (0.2 + 0.06 * Math.sin(tt * 3)) * K.auraK);
    if (ST.circle > 0) drawMagicCircle(0, -1, ST.cast === 2 ? 44 : 30, K.magicC, ST.circle, 0.3, 1.4);
    if (ST.charge > 0) {
      const ck = ST.charge;
      glow(0, -44, 30 + 26 * ck, ck >= 1 ? '#fff2b0' : '#8ac8ff', 0.18 + 0.25 * ck);
      if (ck >= 1) drawMagicCircle(0, -1, 26 + Math.sin(tt * 20) * 1.5, '#fff2b0', 0.8, 0.3, 3);
    }
    if (ST.dash && ST.dashK > 0) drawDashFx(K, ST.dash, ST.dashK, tt);
  }
  // 본체: 역광 테두리(뒤-위로 비켜 찍은 차가운 단색 복사본) → 본체 → 섬광
  if (off) {
    const S = bodyOffscreen(ctx, K, P, W, tt, hs, fac, flashK > 0 ? flashCol : RIM_COL);
    if (wantRim) { // 채색 퍼펫은 자체 명암이 있어 테두리를 가늘고 옅게
      const pk = K.pup ? PUP_RIM : null;
      blitOff(ctx, TINTC, S, fac, hs, -fac * (pk ? pk[0] : 1.05) * hs, -(pk ? pk[1] : 0.95) * hs, pk ? pk[2] : RIM_A, 'source-over');
    }
    blitOff(ctx, BODYC, S, fac, hs, 0, 0, 1, 'source-over');
    if (flashK > 0) blitOff(ctx, TINTC, S, fac, hs, 0, 0, 0.75 * flashK, 'lighter');
  } else drawLayers(c, E, K, P, W, tt);
  // 5) 채찍 끈 / 궤적 / 효과
  if (mv && ST.lash) {
    const n = lashPoints(E, K, p, mv, ST.lash, ST.t, LASH);
    if (G.fx && ST.ph === 1) { // 채찍이 공기를 가르는 빛
      const kf = 1 - ST.u * 0.6, gc = W.glowC || '#ffe8c0';
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = ra(gc, 0.3 * kf); c.lineWidth = 7;
      c.beginPath(); c.moveTo(LASH[0], LASH[1]); for (let i = 1; i < n; i++) c.lineTo(LASH[i * 2], LASH[i * 2 + 1]); c.stroke();
      const i0 = Math.floor(n * 0.3);
      c.strokeStyle = ra('#ffffff', 0.45 * kf); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(LASH[i0 * 2], LASH[i0 * 2 + 1]); for (let i = i0 + 1; i < n; i++) c.lineTo(LASH[i * 2], LASH[i * 2 + 1]); c.stroke();
      c.restore();
    }
    drawLash(W, LASH, n);
    if (ST.ph === 1 && ST.u > 0.35 && G.fx) { // 채찍 끝 파열음 섬광
      const e = (n - 1) * 2, k = 1 - (ST.u - 0.35) / 0.65, x = LASH[e], y = LASH[e + 1];
      glow(x, y, 16, W.glowC || '#fff4d0', 0.85 * k);
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = ra('#ffffff', 0.9 * k); c.lineWidth = 1;
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * 1.047 + ST.t * 9, r0 = 3, r1 = 7 + 5 * k; c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); } c.stroke();
      const rr = 4 + 13 * (1 - k); // 파열 충격파 고리
      c.strokeStyle = ra(W.glowC || '#fff4d0', 0.75 * k); c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, y, rr, rr * 0.65, 0, 0, TAU); c.stroke();
      c.restore();
    }
    if (ST.lash === 4) drawSpinTrail(E, K, p, mv, (mv.box ? mv.box.w * 0.5 * (1 + ((p.stats?.reach ?? 0) / 100)) : 110) / hs, mv.box ? (mv.box.y + mv.box.h / 2) / hs : -62);
  } else if (ST.charge > 0 && W.type === 'whip') {
    const n = lassoPoints(E, K, LASH, tt);
    drawLash(W, LASH, n);
  }
  if (mv && ST.atk) {
    const A = ST.atk;
    if (ST.spin === 'great' || (ST.spin === 'blade' && !ST.air)) {
      let R = (K.ua + K.fa + weaponReach(W)) * 0.95;
      if (mv.box) R = Math.max(R, mv.box.w * 0.5 * (1 + ((p.stats?.reach ?? 0) / 100)) / hs * 0.92);
      drawSpinTrail(E, K, p, mv, R, (SK.s1y + SK.h1y) / 2);
    } else if (A.trail || (ST.spin === 'blade' && ST.air)) drawTrail(E, K, p, mv, A.trail === 2 ? 2 : 1);
    if (A.streak) drawStreak(E, K, p, mv, A.streak);
    if (ST.plunge > 0 && G.fx) drawPlungeFx(K, ST.plunge);
    if (ST.cast && ST.circle > 0 && G.fx) {
      tx0(P, SK.h1x + Math.cos(P.w1) * 32, SK.h1y + Math.sin(P.w1) * 32);
      glow(TX, TY, 18, K.magicC, 0.7 * ST.circle);
      if (ST.cast === 1) { c.save(); c.translate(TX + 6, TY); c.scale(0.4, 1); drawMagicCircle(0, 0, 12, K.magicC, ST.circle, 1, -2); c.restore(); }
    }
  }
  if (ST.cast === 3 && ST.circle > 0 && G.fx) { // 스킬 시전: 먼 손 앞 문양
    tx0(P, SK.h2x + 5, SK.h2y); c.save(); c.translate(TX + 3, TY); c.scale(0.35, 1); drawMagicCircle(0, 0, 12, K.magicC, ST.circle, 1, -3); c.restore();
    glow(TX, TY, 14, K.magicC, 0.6 * ST.circle);
  }
  if (ST.charge > 0 && G.fx) drawChargeFx(K, P, ST.charge, tt);
  // 6) 오라 입자
  if (K.aura && G.fx) drawAuraMotes(K.aura.type || 'holy', K.auraC, K.auraK * (mist ? 0.4 : 1), K.auraK < 1 ? 5 : 8, 84);
  if (mist && G.fx) drawMist(ST.dashK, tt);
  if (opts.debugBox && mv?.box) { c.strokeStyle = '#ff0'; c.lineWidth = 1 / hs; const b = mv.box, r = 1 + ((p.stats?.reach ?? 0) / 100); c.strokeRect(b.x / hs, b.y / hs, b.w * (b.x >= 0 ? r : 1) / hs, b.h / hs); }
  ctx.restore();
}
/** 몸 전체(날개 → 체인 천/머리카락 → 본체·무기). 실루엣 패스에서도 그대로 재사용 */
function drawLayers(c, E, K, P, W, tt) {
  if (K.pup && PUP.drawLayers(c, E, K, P, W, tt)) return;   // 채색 퍼펫
  // 날개 (몸 변환)
  c.save(); applyT1(c, P);
  if (K.wings) drawWings(SK, K, P, E.p, tt);
  c.restore();
  // 망토·머리카락·스카프 꼬리 (월드 체인)
  drawCape(SK, K, E);
  drawHairChains(SK, K, E);
  drawBandTails(SK, K, E);
  drawVeil(SK, K, E);
  drawScarfTail(SK, K, E);
  // 본체
  c.save(); applyT1(c, P);
  // 먼 팔 + 보조 무기
  if (K.off && W.type !== 'none') drawWeapon(W, SK.h2x, SK.h2y, P.w2, { fire: ST.fire2 });
  group(drawArm, SK, K, false); drawPauldron(SK, K, false);
  drawHand(SK, K, false);
  drawSkirt(SK, K, P, false);
  if (!E.skipFarLeg) group(drawLeg, SK, K, false);
  drawTorso(SK, K, E);
  drawSash(SK, K);
  group(drawLeg, SK, K, true);
  drawSkirt(SK, K, P, true);
  drawTabard(SK, K);
  // 채찍 고리: 발 딛음(p.feel.stepK, feel_move 가 딛을 때 1 → 8/s 로 줄어듦)마다 살짝 튕긴다 (feel.md §3.3.2 'special')
  if (ST.coil) { sp(SK, K, 0.1, -backAt(K, 0.1) * 0.3); drawWhipCoil(W, QX, QY, SW.tr * 0.05 + Math.sin(tt * 3) * 0.05 + (E.p?.feel?.stepK ?? 0) * 0.07); }
  if (K.o === 'merchant') drawPack(SK, K);
  drawMantle(SK, K);
  drawCollar(SK, K, true);
  drawNeck(SK, K);
  drawHead(SK, K, E, P);
  drawCollar(SK, K, false);
  drawScarfWrap(SK, K);
  // 가까운 팔 + 주무기
  group(drawArm, SK, K, true); drawPauldron(SK, K, true);
  const hasMain = W.type !== 'none' && W.type !== 'whip' || (W.type === 'whip' && !ST.coil);
  if (hasMain) drawWeapon(W, SK.h1x, SK.h1y, P.w1, { fire: ST.fire1 });
  drawHand(SK, K, true);
  if (P.two && hasMain) drawHand(SK, K, false);
  c.restore();
}
/** 채색 퍼펫 역광 테두리: [x 비킴, y 비킴, 불투명도] */
const PUP_RIM = [0.8, 0.75, 0.5];

// ── 오프스크린 본체 패스 (역광 테두리 / 피격 섬광) ──
// 몸 전체를 전용 캔버스(BODY)에 한 번 그리고 → 그 알파로 단색 복사본(TINT)을 만들어
// 뒤-위로 비켜 찍으면 가장자리에 차가운 역광선이 남는다. 벡터 패스는 1회뿐이라 저렴하다.
const RIM_COL = '#a4b8ff', RIM_A = 0.58, FLASH_COL = '#ffd0c0';
let BODYC = null, TINTC = null;
const OB = { W: 0, H: 0, bw: 0, bt: 0, bb: 0 };
function offCanvas(cv, W, H) {
  if (!cv) cv = document.createElement('canvas');
  if (cv.width < W || cv.height < H) { cv.width = Math.max(cv.width, W); cv.height = Math.max(cv.height, H); }
  return cv;
}
/** 본체 레이어를 BODYC 에 그리고, col 단색 복사본을 TINTC 에 만든다 */
function bodyOffscreen(ctx, K, P, W, tt, hs, fac, col) {
  const m = ctx.getTransform();
  const rs = Math.min(Math.hypot(m.a, m.b) || 1, 3);
  const bw = 122 * hs, bt = 152 * hs, bb = 22 * hs;
  const Wd = Math.ceil(2 * bw * rs), Hd = Math.ceil((bt + bb) * rs);
  BODYC = offCanvas(BODYC, Wd, Hd); TINTC = offCanvas(TINTC, Wd, Hd);
  const oc = BODYC.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0); oc.globalAlpha = 1; oc.globalCompositeOperation = 'source-over';
  oc.clearRect(0, 0, Wd + 2, Hd + 2);
  oc.setTransform(rs * fac * hs, 0, 0, rs * hs, bw * rs, bt * rs);
  oc.lineJoin = 'round'; oc.lineCap = 'round';
  const gc = G.c;
  G.c = oc;
  drawLayers(oc, E0, K, P, W, tt);
  G.c = gc;
  const tc = TINTC.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, Wd + 2, Hd + 2);
  tc.drawImage(BODYC, 0, 0, Wd, Hd, 0, 0, Wd, Hd);
  tc.globalCompositeOperation = 'source-in'; tc.fillStyle = col; tc.fillRect(0, 0, Wd, Hd);
  tc.globalCompositeOperation = 'source-over';
  OB.W = Wd; OB.H = Hd; OB.bw = bw; OB.bt = bt; OB.bb = bb;
  return OB;
}
/** 오프스크린 캔버스를 월드 좌표로 찍기 (현재 ctx 는 발 중앙·배율이 적용된 로컬 상태) */
function blitOff(ctx, cv, S, fac, hs, dx, dy, alpha, op) {
  ctx.save();
  ctx.scale(fac / hs, 1 / hs); // 로컬 배율 해제 (fac 는 ±1)
  ctx.globalAlpha = alpha; ctx.globalCompositeOperation = op;
  ctx.drawImage(cv, 0, 0, S.W, S.H, -S.bw + dx, -S.bt + dy, 2 * S.bw, S.bt + S.bb);
  ctx.restore();
}

const newST0 = newST();
const GH = new Float32Array(48);

function drawWings(s, K, P, p, t) {
  const c = G.c;
  sp(s, K, 0.82, -backAt(K, 0.82) + 1.5);
  const bx = QX, by = QY;
  const air = p.onGround === false;
  const vy = p.vy || 0;
  const run = p.anim === 'run';
  let spread = air ? (vy < 0 ? 0.85 : 1) : run ? 0.35 : 0.55;
  let flap = Math.sin(t * (air ? 9 : 2.2)) * (air ? (vy < 0 ? 0.32 : 0.12) : 0.07);
  if (p.anim === 'dash') { spread = 0.2; flap = 0.25; }
  if (p.anim === 'death') { spread = 0.2; flap = 0.6; }
  c.save(); c.translate(bx, by); c.scale(-1, 1); c.rotate(-P.lean * 0.5);
  c.save(); c.translate(-2.2, -1.6); c.rotate(-0.22); drawWing(K.wings, spread, flap * 1.1, true); c.restore();
  drawWing(K.wings, spread, flap, false);
  c.restore();
}
function drawPack(s, K) {
  const c = G.c;
  sp(s, K, 0.62, -backAt(K, 0.62) - 4);
  c.save(); c.translate(QX, QY); c.rotate(Math.atan2(s.fy, s.fx));
  c.beginPath(); c.moveTo(-5, -8); c.quadraticCurveTo(-7.4, 0, -5.6, 9); c.lineTo(3.6, 9.4); c.lineTo(3.8, -8.4); c.quadraticCurveTo(-1, -10.6, -5, -8); c.closePath();
  c.fillStyle = grad(-6, -8, 4, 8, '#6a4a2a', 1); c.fill(); outline('#6a4a2a', 0.7);
  if (!G.tint) {
    c.fillStyle = '#3a2414'; c.fillRect(-5.6, -1.4, 9.4, 1.6); c.fillStyle = '#c8a040'; c.fillRect(-1.4, -1.8, 1.8, 2.4);
    c.fillStyle = '#8a3a2a'; ellipse(-1, -10.6, 4.8, 2.2); c.fill(); outline('#8a3a2a', 0.5);
    c.strokeStyle = '#9a8a6a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-6.6, 6); c.lineTo(-8.8, 13); c.stroke();
  }
  c.restore();
}
function drawDashFx(K, type, k, t) {
  const c = G.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  if (type === 'blink') {
    glow(0, -44, 40, '#fff2b0', 0.6 * k);
    c.strokeStyle = ra('#fff8d8', 0.7 * k); c.lineWidth = 1;
    for (let i = 0; i < 6; i++) { const y = -76 + i * 13 + h01(i + Math.floor(t * 30)) * 4; c.beginPath(); c.moveTo(-10, y); c.lineTo(-40 - 30 * h01(i * 3), y); c.stroke(); }
  } else if (type !== 'mist') {
    // 속도선
    for (let i = 0; i < 7; i++) {
      const y = -74 + i * 11 + h01(i * 7 + Math.floor(t * 40)) * 5, L = 26 + 34 * h01(i * 13 + Math.floor(t * 40));
      const g = c.createLinearGradient(-8, y, -8 - L, y);
      g.addColorStop(0, ra('#cfe0ff', 0.55 * k)); g.addColorStop(1, ra('#cfe0ff', 0));
      c.strokeStyle = g; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-8, y); c.lineTo(-8 - L, y); c.stroke();
    }
  }
  c.restore();
}
function drawMist(k, t) {
  const c = G.c;
  c.save();
  for (let i = 0; i < 7; i++) {
    const x = -6 - i * 7 + Math.sin(t * 9 + i) * 3, y = -70 + (i % 4) * 16 + Math.cos(t * 7 + i) * 3, r = 10 + (i % 3) * 3;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, ra('#8a0a1e', 0.55 * k)); g.addColorStop(1, ra('#1a0008', 0));
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  c.restore();
}
function drawPlungeFx(K, k) {
  const c = G.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  const col = K.W.glowC || (K.W.type === 'staff' ? '#fff2b0' : '#dfeaff');
  for (let i = 0; i < 5; i++) {
    const x = -10 + i * 5, L = 26 + (i % 2) * 14;
    const g = c.createLinearGradient(x, -60, x, -60 - L);
    g.addColorStop(0, ra(col, 0.5 * k)); g.addColorStop(1, ra(col, 0));
    c.strokeStyle = g; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, -64); c.lineTo(x, -64 - L); c.stroke();
  }
  c.restore();
}
function drawChargeFx(K, P, k, t) {
  const c = G.c;
  tx0(P, SK.h1x, SK.h1y);
  const x = TX, y = TY;
  const col = k >= 1 ? '#fff2b0' : '#8ac8ff';
  glow(x, y, 10 + 14 * k, col, 0.5 + 0.4 * k);
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const ph = (t * 1.6 + i / 10) % 1, a = i * 2.4 + t * 3, r = (1 - ph) * (34 + 10 * k);
    c.fillStyle = ra(col, ph * 0.9);
    c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, 0.7 + ph * 1.2, 0, TAU); c.fill();
  }
  if (k >= 1) { c.strokeStyle = ra('#ffffff', 0.5 + 0.5 * Math.sin(t * 30)); c.lineWidth = 1; c.beginPath(); c.arc(x, y, 8 + Math.sin(t * 25) * 2, 0, TAU); c.stroke(); }
  c.restore();
}

/**
 * 무기 단독 미리보기 (갤러리·상점 UI 등): weapon = look.weapon 형식 {type, style, level, rarity, element, color, glow}
 * (x,y) 손잡이 위치, ang 방향, scale 배율, t 시간(발광 애니메이션)
 */
export function drawWeaponPreview(ctx, weapon, x, y, ang = 0, scale = 1, t = 0) {
  const W = weaponSpec(weapon, null);
  const gc = G.c, gt = G.tint, gf = G.fx, gtt = G.t;
  G.c = ctx; G.tint = null; G.t = t; G.fx = true; G.olw = 0.85; G.pass = 0;
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (W.type === 'whip') {
    // 완만한 S자 채찍 끈
    const n = LASH_N, L = 96, hx = Math.cos(ang) * 10, hy = Math.sin(ang) * 10;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), d = u * L, w = Math.sin(u * PI * 1.4 + t * 3) * 7 * u;
      LASH[i * 2] = hx + Math.cos(ang) * d - Math.sin(ang) * w; LASH[i * 2 + 1] = hy + Math.sin(ang) * d + Math.cos(ang) * w + u * u * 10;
    }
    drawLash(W, LASH, n);
  }
  drawWeapon(W, 0, 0, ang, {});
  ctx.restore();
  G.c = gc; G.tint = gt; G.fx = gf; G.t = gtt;
}

// ── 채색 퍼펫 호스트 연결 (hero_puppet.js 는 hero.js 를 import 하지 않는다) ──
PUP.bindHost({
  SK, ST, SW, chain, applyT1, drawWings, drawScarfTail,
  tx(P, x, y, out) { tx0(P, x, y); out[0] = TX; out[1] = TY; return out; },
  CC: { CAPE: CC_CAPE, BAND: CC_BAND, BAND2: CC_BAND2 },
});
export { setPuppetEnabled, preloadPuppet, puppetStatus } from './hero_puppet.js';
