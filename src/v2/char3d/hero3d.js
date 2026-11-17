// v2 char3d — 캐릭터 한 명을 묶는 접착 코드: GLB 받기 → 뼈대 · 클립 · 무기 → 놀이 상태로 몰기 → 그리기. docs/v2/CHAR3D_PILOT.md §4
import { loadGLB } from './glb.js';
import { Rig, Animator } from './skel.js';
import { buildClips } from './clips.js';
import { boxModel } from './render.js';

export const HERO_URL = 'assets/v2/char3d/kael.glb';
/** 모델 1 m 가 세계에서 몇 단위(논리 px)인가: 키 1.8 m → 약 104 */
export const UNIT = 58;

/** 손에 붙이는 시범용 검 (손 뼈 공간, 단위 = 뼈대 단위 cm). 손 뼈의 +Y 가 손끝 쪽이다 */
const BLADE = [
  { min: [-1.6, -9, -1.6], max: [1.6, 9, 1.6], color: [0.32, 0.2, 0.12] },        // 손잡이
  { min: [-7, 9, -2.2], max: [7, 11.5, 2.2], color: [0.78, 0.66, 0.36] },         // 코등이
  { min: [-2.6, 11.5, -0.7], max: [2.6, 78, 0.7], color: [0.86, 0.9, 0.98] },     // 날
  { min: [-1.5, 78, -0.5], max: [1.5, 86, 0.5], color: [0.92, 0.95, 1] },         // 날 끝
  { min: [-2.2, -12, -2.2], max: [2.2, -9, 2.2], color: [0.78, 0.66, 0.36] },     // 자루 끝
];
/** 손 뼈에서 검까지: 주먹을 쥔 것처럼 손바닥 가운데에서 팔과 직각으로 선다 (뷰어에서 맞춘 값) */
export const GRIP = { pos: [0, 7, 3], rotX: -80, rotY: 0, rotZ: 0 };

export async function loadCharAsset(url = HERO_URL) {
  const model = await loadGLB(url);
  const clips = buildClips(new Rig(model), model.anims);
  return { model, clips, url };
}

const mul4 = (a, b, o) => {   // o = a·b (열 우선 4×4, 아핀)
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3; o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3; o[c * 4 + 3] = b3;
  }
  return o;
};
function trs(pos, rx, ry, rz, o) {
  const k = Math.PI / 180, cx = Math.cos(rx * k), sx = Math.sin(rx * k), cy = Math.cos(ry * k), sy = Math.sin(ry * k), cz = Math.cos(rz * k), sz = Math.sin(rz * k);
  // R = Ry · Rx · Rz
  o[0] = cy * cz + sy * sx * sz; o[1] = cx * sz; o[2] = -sy * cz + cy * sx * sz; o[3] = 0;
  o[4] = -cy * sz + sy * sx * cz; o[5] = cx * cz; o[6] = sy * sz + cy * sx * cz; o[7] = 0;
  o[8] = sy * cx; o[9] = -sx; o[10] = cy * cx; o[11] = 0;
  o[12] = pos[0]; o[13] = pos[1]; o[14] = pos[2]; o[15] = 1;
  return o;
}

export class Char3D {
  /** asset: loadCharAsset 결과. renderer: CharRenderer. opts: {maxTex, weapon(기본 true), scale} */
  constructor(asset, renderer, opts = {}) {
    this.asset = asset; this.r = renderer;
    this.rig = new Rig(asset.model); this.anim = new Animator(this.rig, asset.clips);
    this.gpu = opts.gpu ?? renderer.add(asset.model, { maxTex: opts.maxTex ?? 2048 });   // opts.gpu: 같은 모델을 여럿이 나눠 쓸 때
    this.weapon = opts.weapon === false ? null : opts.weaponGpu ?? renderer.add(boxModel(BLADE));
    this.scale = opts.scale ?? UNIT;
    this.dx = 1; this.dz = 0;                       // 보는 방향 (세계 x·z 단위 벡터)
    this.M = new Float32Array(16); this.WM = new Float32Array(16); this._g = new Float32Array(16); this._t = new Float32Array(16);
    this.grip = { ...GRIP };
    this.anim.play('idle', { fade: 0 }); this.anim.update(0);
  }
  /**
   * 놀이 세계(왼손 좌표: x 오른쪽 · y 위 · z 화면 안쪽)용 세계 행렬. 모델의 앞(+Z)이 (dx,dz) 를 보게 놓는다.
   * 화면에서 거울상이 되지 않게 모델의 왼쪽(+X)은 (−dz, dx) 로 보낸다 → 행렬식이 음수이므로 그릴 때 cull:'front'.
   */
  place(x, y, z, dx = this.dx, dz = this.dz, s = this.scale) {
    const M = this.M;
    M[0] = -dz * s; M[1] = 0; M[2] = dx * s; M[3] = 0;
    M[4] = 0; M[5] = s; M[6] = 0; M[7] = 0;
    M[8] = dx * s; M[9] = 0; M[10] = dz * s; M[11] = 0;
    M[12] = x; M[13] = y; M[14] = z; M[15] = 1;
    return M;
  }
  /** 손 뼈 → 무기 세계 행렬 (M 을 정한 뒤에) */
  weaponMatrix(M = this.M) {
    const b = this.rig.boneWorld('handR'); if (!b) return null;
    const g = this.grip;
    mul4(b, trs(g.pos, g.rotX, g.rotY, g.rotZ, this._g), this._t);
    return mul4(M, this._t, this.WM);
  }
  /** 그린다 (renderer.begin 뒤). o: CharRenderer.draw 의 옵션 + {mirror(놀이 세계 = true)} */
  draw(M = this.M, o = {}) {
    const cull = o.cull ?? (o.mirror === false ? 'back' : 'front');
    this.r.draw(this.gpu, this.rig.jm, M, { ...o, cull });
    if (this.weapon) { const W = this.weaponMatrix(M); if (W) this.r.draw(this.weapon, null, W, { ...o, cull, rim: [0.7, 0.8, 1, 0.5] }); }
  }
}

const ATK1 = { strike: [0.45, 0.66], lead: 0.2, tail: 0.3 };   // 라이브러리 베기 클립(1.53초)에서 칼이 지나가는 구간 (뷰어에서 본 값)
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * 시범판 B 의 영웅 상태(sim.js hero) → 방향 · 클립. 360° 로 움직이는 쪽을 본다.
 * 공격·피격 판정은 아직 좌우(facing)로만 나므로 공격하는 동안은 facing 쪽을 본다 (놀이 규칙을 방향 기반으로 바꾸면 이 줄만 고치면 된다).
 */
export function driveHero(ch, h, dt, T = {}) {
  const sp = Math.hypot(h.vx, h.vz);
  let tx = ch.dx, tz = ch.dz, rate = 14;
  if (h.dead || h.hurtT > 0) { /* 그대로 */ }
  else if (h.move) { tx = h.facing; tz = 0; rate = 34; }
  else if (h.dashT > 0) { const d = Math.hypot(h.dvx, h.dvz) || 1; tx = h.dvx / d; tz = h.dvz / d; rate = 40; }
  else if (sp > 24) { tx = h.vx / sp; tz = h.vz / sp; }
  const cur = Math.atan2(ch.dz, ch.dx), a = cur + wrapPi(Math.atan2(tz, tx) - cur) * (1 - Math.exp(-dt * rate));
  ch.dx = Math.cos(a); ch.dz = Math.sin(a);
  const A = ch.anim;
  if (h.dead) A.play('death', { fade: 0.08, time: Math.min((h.deadT ?? h.animT) * 1.35, 2.5) });
  else if (h.hurtT > 0) A.play('hurt', { fade: 0.04, time: h.animT });
  else if (h.move) {
    const mv = h.move, u = h.moveT / mv.dur, air = !h.onGround || /^swA/.test(mv.id ?? '');
    if (air) A.play('atk_air', { fade: 0.04, time: u * 0.26 });
    else if (h.combo === 1) A.play('atk2', { fade: 0.04, time: u * 0.26 });
    else if (h.combo >= 2) A.play('atk3', { fade: 0.04, time: u * 0.3 });
    else if (ch.asset.clips.atk1) {
      const S = ATK1, t = h.moveT, h0 = mv.hit[0], h1 = mv.hit[1];
      const ct = t < h0 ? S.strike[0] - S.lead * (1 - t / h0) : t < h1 ? S.strike[0] + (S.strike[1] - S.strike[0]) * ((t - h0) / (h1 - h0)) : S.strike[1] + S.tail * ((t - h1) / Math.max(0.01, mv.dur - h1));
      A.play('atk1', { fade: 0.04, time: ct });
    } else A.play('atk2', { fade: 0.04, time: u * 0.26 });
  }
  else if (h.dashT > 0) A.play('dash', { fade: 0.03, time: h.animT });
  else if (!h.onGround) { if (h.vy > 60) A.play('jump', { fade: 0.05, time: h.animT }); else A.play('fall', { fade: 0.16 }); }
  else if (h.landT > 0) A.play('land', { fade: 0.03, time: 0.14 * (1 - h.landT / 0.1) });
  else if (sp > 36) A.play('run', { fade: 0.12, speed: Math.max(0.55, Math.min(1.2, sp / (T.runX ?? 275))) });
  else A.play('idle', { fade: 0.16 });
  A.update(dt);
}
