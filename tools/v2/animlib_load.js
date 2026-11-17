// v2 animlib — 공용 클립 라이브러리 읽기 (브라우저 · 게임용). docs/v2/ANIM_LIBRARY.md §4
// 런타임을 고치지 않고 그 위에 얹는다: glb.js loadGLB 로 묶음 GLB 를 읽고 skel.js clipFromAnim 으로 정규 클립을 만든다.
// 게임에 넣을 때는 이 파일을 src/v2/char3d/animlib.js 로 옮기면 된다 (요청: /tmp/claude-0/v2/requests.md).
//
//   const lib = await loadAnimLib('assets/v2/char3d/clips/index.json');          // 전부
//   const lib = await loadAnimLib(url, { groups: ['locomotion', 'combat'] });     // 묶음을 골라서 (적은 enemy + reactions 만 등)
//   Object.assign(asset.clips, lib.clips);        // Animator 가 쓰는 묶음에 더한다 (이름: idle · run · atk1 · roll …)
//   lib.clips.atk1.meta  → { dur, speed, ev:[[초,'hit'], …], strike:[t0,t1], travel:[x,z], loop, … }   (index.json 의 한 줄)
import { loadGLB } from '../../src/v2/char3d/glb.js';
import { Rig, clipFromAnim } from '../../src/v2/char3d/skel.js';

/** 묶음 GLB 모델 하나 + index → { 이름: 정규 클립 } */
export function clipsFromGroup(model, index) {
  const by = new Map(index.clips.map((c) => [c.n, c])), rig = new Rig(model), out = {};
  for (const a of model.anims) {
    const m = by.get(a.name); if (!m) continue;
    const c = clipFromAnim(rig, a, { name: m.n, loop: m.loop });   // 이동 가공 · 자르기는 만들 때 끝냈다 → 옵션 없이 그대로
    c.meta = m; c.speed = m.speed; c.events = m.ev; out[m.n] = c;
  }
  return out;
}

export async function loadAnimLib(indexUrl, { groups = null } = {}) {
  const res = await fetch(indexUrl);
  if (!res.ok) throw new Error('클립 목록을 받지 못했습니다: ' + indexUrl + ' (' + res.status + ')');
  const index = await res.json(), base = indexUrl.replace(/[^/]*$/, ''), clips = {};
  await Promise.all(index.groups.filter((g) => !groups || groups.includes(g.g)).map(async (g) => Object.assign(clips, clipsFromGroup(await loadGLB(base + g.file), index))));
  return { index, clips };
}

/**
 * 이벤트 꺼내기: 직전 시각 t0 → 지금 시각 t1 (클립 초, 1배속 기준) 사이에 지난 이벤트 이름들. 순환 클립은 넘어간 것도 센다.
 *   for (const e of eventsBetween(clip, prevT, curT)) sound.play(e)
 */
export function eventsBetween(clip, t0, t1) {
  const ev = clip.events; if (!ev || !ev.length || t1 === t0) return [];
  const d = clip.duration, out = [];
  if (clip.loop) { const a = ((t0 % d) + d) % d, b = ((t1 % d) + d) % d; for (const e of ev) if (a <= b ? e[0] > a && e[0] <= b : e[0] > a || e[0] <= b) out.push(e[1]); }
  else for (const e of ev) if (e[0] > t0 && e[0] <= t1) out.push(e[1]);
  return out;
}

/**
 * 판정 구간에 맞춰 시간 접기 (hero3d.js 의 ATK1 과 같은 방식을 모든 공격 클립에): 놀이 규칙의 공격 시간 t (0…dur), 판정 구간 [h0, h1] →
 * 클립 시각. 클립의 strike 구간이 판정 구간과 겹치게 하고, 그 앞은 lead 초만큼만(준비 동작의 끝), 뒤는 tail 초만큼 보여 준다.
 */
export function warpToHit(clip, t, dur, h0, h1, lead = 0.2, tail = 0.35) {
  const S = clip.meta?.strike; if (!S) return (t / dur) * clip.duration;
  if (t < h0) return Math.max(0, S[0] - lead * (1 - t / h0));
  if (t < h1) return S[0] + (S[1] - S[0]) * ((t - h0) / (h1 - h0));
  return Math.min(clip.duration, S[1] + tail * ((t - h1) / Math.max(0.01, dur - h1)));
}
