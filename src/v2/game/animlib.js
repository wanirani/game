// v2g animlib — reads the shared clip library (assets/v2/char3d/clips/, docs/v2/ANIM_LIBRARY.md 4).
// Moved from tools/v2/animlib_load.js (same exports) with the import paths of the game tree.
//   const lib = await loadAnimLib(ASSET_ROOT + 'v2/char3d/clips/index.json', { groups: ['locomotion', 'combat'] });
//   lib.clips.atk1.meta -> { dur, speed, ev:[[sec,'hit'], ...], strike:[t0,t1], travel:[x,z], loop, ... }  (one row of index.json)
import { loadGLB } from '../char3d/glb.js';
import { Rig, clipFromAnim } from '../char3d/skel.js';

/** one group GLB model + index -> { name: canonical clip } */
export function clipsFromGroup(model, index) {
  const by = new Map(index.clips.map((c) => [c.n, c])), rig = new Rig(model), out = {};
  for (const a of model.anims) {
    const m = by.get(a.name); if (!m) continue;
    const c = clipFromAnim(rig, a, { name: m.n, loop: m.loop });
    c.meta = m; c.speed = m.speed; c.events = m.ev; out[m.n] = c;
  }
  return out;
}

export async function loadAnimLib(indexUrl, { groups = null } = {}) {
  const res = await fetch(indexUrl);
  if (!res.ok) throw new Error('animlib: index ' + indexUrl + ' -> ' + res.status);
  const index = await res.json(), base = indexUrl.replace(/[^/]*$/, ''), clips = {}, files = [];
  await Promise.all(index.groups.filter((g) => !groups || groups.includes(g.g)).map(async (g) => {
    const model = await loadGLB(base + g.file); files.push(base + g.file);
    for (const b of model.bitmaps ?? []) { try { b?.close?.(); } catch { /* none */ } }
    Object.assign(clips, clipsFromGroup(model, index));
  }));
  return { index, clips, files };
}

/** events between clip times t0 -> t1 (allocates; use for tools). Looping clips wrap. */
export function eventsBetween(clip, t0, t1) {
  const ev = clip.events; if (!ev || !ev.length || t1 === t0) return [];
  const d = clip.duration, out = [];
  if (clip.loop) { const a = ((t0 % d) + d) % d, b = ((t1 % d) + d) % d; for (const e of ev) if (a <= b ? e[0] > a && e[0] <= b : e[0] > a || e[0] <= b) out.push(e[1]); }
  else for (const e of ev) if (e[0] > t0 && e[0] <= t1) out.push(e[1]);
  return out;
}
/** allocation-free variant: number of events named `name` (prefix match) crossed between t0 and t1 */
export function countEvents(clip, t0, t1, prefix) {
  const ev = clip.events; if (!ev || !ev.length || t1 === t0) return 0;
  const d = clip.duration; let n = 0;
  const a = clip.loop ? ((t0 % d) + d) % d : t0, b = clip.loop ? ((t1 % d) + d) % d : t1;
  for (let i = 0; i < ev.length; i++) { const t = ev[i][0]; if (!ev[i][1].startsWith(prefix)) continue; if (a <= b ? t > a && t <= b : clip.loop && (t > a || t <= b)) n++; }
  return n;
}

/** fold a move's time onto the clip so that the clip's strike window overlaps the rule's hit window [h0, h1] */
export function warpToHit(clip, t, dur, h0, h1, lead = 0.2, tail = 0.35) {
  const S = clip.meta?.strike; if (!S) return (t / dur) * clip.duration;
  if (t < h0) return Math.max(0, S[0] - lead * (1 - t / h0));
  if (t < h1) return S[0] + (S[1] - S[0]) * ((t - h0) / (h1 - h0));
  return Math.min(clip.duration, S[1] + tail * ((t - h1) / Math.max(0.01, dur - h1)));
}
