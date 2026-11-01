// 채색 수호신: 무닌 (gd_munin, 이름을 기억하는 늙은 까마귀) — 8단계 portrait2. T1 채색 퍼핏 (에셋 assets/painted/companions/gd_munin/).
// 미네르바(gd_owl)와 같은 짜임: body (날아오는 까마귀의 볏·머리·붉은 목도리·몸·늘어뜨린 발톱) · wingL / wingR (들어 올린 두 날개,
//   어깨 피벗 — 몸 뒤에서 아래로 내려친다) · perch (어깨에 선 3/4 모습). 원본: Higgsfield 다시 그림 (tools/painted/companions/gd_munin/parts.json).
// 그림 속 날개가 '올려 친' 모습이라 fl 0 = 그림 그대로(위), 1 = 끝까지 내려친 모습. 올빼미와 달리 후광이 없다 (각성: 몸의 기운이 커지고 머리 위에 붉은 기운이 피어오른다).
// 상태: idle 제자리 날갯짓 · move 빠르면 짧은 날갯짓 · attack/assist 급강하(날개 반쯤 접고 앞으로 기울기) · skill 까마귀 떼(날개 활짝, 눈 빛) ·
//   emote 고개 갸웃 · hurt 움찔 · appear 커지며 나타남 · perch 어깨에 앉음(가끔 눈 깜빡). 같은 그리기를 베스퍼(gd_vesper.js)가 빌려 쓴다.
import * as K from '../enemy_kit.js';
import { clamp, lerp } from '../../../core/math.js';
import { gGlow, gAwake } from '../../guardians.js';

export const spec = {
  id: 'gd_munin', tier: 'T1', src: '../companions/gd_munin',
  bake: { outline: 0.3, deep: { wingR: 0.82 }, deepTint: 'rgb(70,70,90)', flash: false },
};

const _q = [0, 0];
const easeOut = (k) => 1 - (1 - k) * (1 - k);

/** 날개 달린 작은 수호신(까마귀·박쥐) 그리기 — o: { eye, eyeR, cast, aura, flap(날갯짓 빠르기), dn(내려치기 각), lift(몸 띄움), single(눈 하나) } */
export function makeFlyer(sp, o) {
  async function load() {
    const rig = K.requestRig(sp);
    await rig.promise;
    if (!rig.ready) throw new Error('rig ' + sp.id);
    return rig;
  }
  /** 앉음 ↔ 날기 교차 비율 (그리기 전용 상태, 게임 시간 g.t 로만 움직인다) */
  function perchK(g, want) {
    const t = g.t ?? 0, last = g._flyT;
    let k = g._flyPk ?? want;
    if (last !== undefined) { const dt = clamp(t - last, 0, 0.1); k += clamp(want - k, -dt / 0.18, dt / 0.18); }
    g._flyT = t; g._flyPk = k;
    return k;
  }
  function draw(ctx, g, world, rig) {
    const t = g.t ?? 0, at = g.animT ?? 0, an = g.anim ?? 'idle';
    const f = g.facing < 0 ? -1 : 1, vxf = (g.vx ?? 0) * f;
    const perchWant = an === 'perch' || (!!g.perched && an === 'idle') ? 1 : 0;
    const pk = perchK(g, perchWant);
    const cast = an === 'skill', emote = an === 'emote', atk = an === 'attack' || an === 'assist';
    const hurt = an === 'hurt' ? 1 - clamp(at / 0.3, 0, 1) : 0;
    const ap = an === 'appear' ? easeOut(clamp(at / 0.3, 0, 1)) : 1;
    const aw = gAwake(g);
    const bob = Math.sin(t * 2.6 + (g.seed ?? 0)) * 1.3 * (1 - pk);
    let tilt = clamp(vxf * 0.0008, -0.2, 0.3) - hurt * 0.3;
    if (atk) tilt = 0.55;
    if (emote) tilt = Math.sin(clamp(at, 0, 1) * Math.PI * 2) * 0.28;
    tilt *= 1 - pk;
    const sc = 0.55 + 0.45 * ap;
    gGlow(ctx, 0, -12 + bob, cast ? 24 : aw ? 17 : 12, o.aura, cast ? 0.5 : aw ? 0.42 : 0.14);
    if (hurt > 0) ctx.translate(Math.sin(t * 70) * 1.2 * hurt, 0);
    ctx.translate(0, -12 + bob);
    if (sc !== 1) ctx.scale(sc, sc);
    ctx.rotate(tilt);
    let e1x = 0, e1y = -6, e2x = 0, e2y = -6;
    K.begin(ctx, rig, 0);
    // ── 날기 (pk < 1) ──
    if (pk < 1) {
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * (1 - pk);
      // 날갯짓: fl 0 = 그림처럼 들어 올림, 1 = 끝까지 내려침
      const w = o.flap;
      let fl = 0.5 - 0.5 * Math.cos(t * w), wsy = 0.86 + 0.14 * Math.abs(Math.cos(t * w));
      if (atk) { fl = 0.75; wsy = 0.7; }
      else if (cast) fl = lerp(0.6, -0.12, easeOut(clamp(at / 0.2, 0, 1)));
      else if (Math.abs(vxf) > 200) fl = 0.45 + 0.25 * Math.sin(t * w * 0.7);
      else if (hurt > 0) fl = 0.9;
      const bx = 0, by = o.lift;
      // 몸 뒤 두 날개: 앞(화면 오른쪽, 그림의 wingL) 은 + 로, 뒤(화면 왼쪽, 그림의 wingR) 는 − 로 돌리면 아래로 내려친다
      const dn = o.dn * fl;
      K.pivotPos('body', 'c', 'wr', bx, by, 0, 1, 1, _q);
      K.put('wingR', 'a', _q[0], _q[1], -dn, 1, wsy, 1, 'deep');
      K.pivotPos('body', 'c', 'wl', bx, by, 0, 1, 1, _q);
      K.put('wingL', 'a', _q[0], _q[1], dn, 1, wsy, 1);
      K.put('body', 'c', bx, by, 0, 1, 1);
      K.pivotPos('body', 'c', 'eye', bx, by, 0, 1, 1, _q); e1x = _q[0]; e1y = _q[1];
      K.pivotPos('body', 'c', 'eye2', bx, by, 0, 1, 1, _q); e2x = _q[0]; e2y = _q[1];
      ctx.globalAlpha = ga;
    }
    // ── 앉음 (pk > 0): 발(a)이 어깨 위 원점 → 몸 중심 좌표로 +12 ──
    if (pk > 0) {
      const ga = ctx.globalAlpha; ctx.globalAlpha = ga * pk;
      const px = 0, py = 12 - bob;
      const nod = Math.sin(t * 1.3) * 0.03;
      K.pivotPos('perch', 'a', 'eye', px, py, nod, 1, 1, _q); const p1x = _q[0], p1y = _q[1];
      K.pivotPos('perch', 'a', 'eye2', px, py, nod, 1, 1, _q); const p2x = _q[0], p2y = _q[1];
      K.put('perch', 'a', px, py, nod, 1, 1);
      if (pk >= 0.5) { e1x = p1x; e1y = p1y; e2x = p2x; e2y = p2y; }
      ctx.globalAlpha = ga;
    }
    K.end();
    // 각성(유대 4): 머리 위로 피어오르는 기운 (올빼미의 두 번째 후광 자리) — 날 때는 볏, 앉을 때는 머리 위
    if (aw) {
      const hx = (e1x + e2x) / 2, hy = Math.min(e1y, e2y) - 3 + Math.sin(t * 3.1) * 0.6;
      gGlow(ctx, hx, hy, 7.5, o.aura, 0.55, 0.3);
      gGlow(ctx, hx, hy - 3, 4, o.cast, 0.45, 0.3);
    }
    // 눈빛 (앉아 있을 때 가끔 깜빡)
    const blink = pk > 0.5 && ((t % 3.9) < 0.12);
    if (!blink) {
      const ea = cast ? 1 : aw ? 0.75 : 0.5;
      gGlow(ctx, e1x, e1y, cast ? 3.6 : o.eyeR, o.eye, ea, 0.25);
      if (!o.single) gGlow(ctx, e2x, e2y, cast ? 3.2 : o.eyeR * 0.85, o.eye, ea * 0.85, 0.25);
    }
    if (cast) gGlow(ctx, (e1x + e2x) / 2 + 3, (e1y + e2y) / 2, 10 + Math.sin(t * 20) * 1.5, o.cast, 0.6);
  }
  return { id: sp.id, kind: 'companion', load, draw };
}

export default makeFlyer(spec, { eye: '#ff3a4a', eyeR: 1.6, cast: '#ff6a7a', aura: '#ff4a6a', flap: 8.5, dn: 1.15, lift: 0, single: true });
