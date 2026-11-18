// v2g people — townspeople (area.actors) as 3D models with library clips, and the usable spots of an area (area.interact).
// docs/v2/AREA_FORMAT.md 4-5, docs/v2/ENGINE_API.md 3.
//   - every actor is an Actor3D of the cast (same models, same clip library as the hero and the enemies; group "story" has the poses)
//   - near the hero a person turns the head-and-body towards him; while spoken to, the talk clip plays
//   - one prompt at a time (the nearest person or spot in reach) and only while no awake enemy is close: people never get in the way of a fight
//   - solid people are collision boxes of the world (area.js adds them), so the rules' own collision keeps the hero and the enemies out
// The scene raises the events (talk / interact); until the story lane is plugged in, each person has one neutral line (LINES).
const POSE = { idle: 'idle', talk: 'talk2', kneel: 'kneel_down', sit: 'sit_idle', lantern: 'lantern_look', work: 'idle', cower: 'kneel_down' };
const TURNS = { idle: 1, talk: 1, lantern: 1, work: 1 };   // poses that may turn to look at the hero (kneeling / sitting people only turn the head by staying put)
const NEAR = 250, REACH = 92, CALM2 = 560 * 560, FADE0 = 1500, NEAR2 = FADE0 * FADE0, FAR2 = 1700 * 1700;
/** Korean display names by actor id, then by model id */
export const NAMES = {
  alberto: '알베르토 신부', elise: '엘리제', lotte: '로테', sera: '세라', marta: '마르타', hadwin: '하드윈', hadwin1: '하드윈 1세', edmund: '에드문트',
  rook: '로크', keeper: '묘지기', stallkeeper: '좌판 아낙', farmer: '농부', wounded: '다친 남자', trapped: '마을 여자', villager_f: '마을 사람', villager_m: '마을 사람',
};
/** one neutral line per person until the story is plugged in (each keeps the person's way of speaking) */
export const LINES = {
  alberto: '허허, 자네 왔는가. 밤이 길다네.', elise: '아저씨, 조심해요!', lotte: '아저씨, 있잖아요… 조심하세요.', sera: '사냥꾼님, 빛이 함께하기를.',
  marta: '하하! 무사했네, 사냥꾼 양반.', hadwin: '… 왔소.', hadwin1: '허, 손님이구려.', edmund: '젊은이, 밤이 길군.', rook: '헤헤, 나리. 또 뵙습죠.',
  keeper: '손님, 밤길 조심하시지요.', stallkeeper: '어서… 가세요…', farmer: '밤이 깊었소. 조심하시오.', wounded: '고맙소… 덕분에 살았소.', trapped: '고마워요… 정말 고마워요.',
};
const PORTRAITS = { alberto: 1, edmund: 1, elise: 1, hadwin: 1, hadwin1: 1, lotte: 1, marta: 1, rook: 1, sera: 1 };
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class People {
  constructor() {
    this.list = []; this.spots = []; this.target = null; this.talking = null; this.calm = true; this.tickN = 0;
    this.prompt = { action: 'confirm', label: '', x: 0, y: 0, z: 0, icon: 'interact', onTap: null };
    this.shown = [this.prompt]; this.none = [];
  }
  /** model ids the area's people need (for Cast.load) */
  static models(area) { const out = []; for (const a of area.actors) if (a.model && !out.includes(a.model)) out.push(a.model); return out; }
  /** make the actors of an area. sc = the scene (cast, ground, boxes). Call after the cast has loaded the models. */
  build(sc, area, groundAt) {
    this.release(sc);
    const W = area.W;
    for (const d of area.actors) {
      const a3 = sc.cast.actor(d.model, null, {}); if (!a3) { console.warn('[v2g] actor model missing:', d.model); continue; }
      const f = Array.isArray(d.face) ? d.face : [0, -1], l = Math.sqrt(f[0] * f[0] + f[1] * f[1]) || 1, gy = groundAt(W, d.x, d.z, d.y != null ? d.y + 40 : Infinity);
      const pose = POSE[d.pose] ? d.pose : 'idle', clip = a3.asset.clips[POSE[pose]] ? POSE[pose] : 'idle';
      a3.dx = f[0] / l; a3.dz = f[1] / l; a3.anim.play(clip, { fade: 0, restart: true }); a3.anim.update(pose === 'kneel' || pose === 'cower' ? 5 : Math.random() * 3);
      if (Array.isArray(d.tint)) { a3.tintK = d.tint; }
      let box = null; for (let i = 0; i < W.boxes.length; i++) if (W.boxes[i].actor === d.id) box = W.boxes[i];
      this.list.push({
        def: d, id: d.id, a3, x: d.x, y: Number.isFinite(gy) ? gy : d.y ?? 0, z: d.z, hx: a3.dx, hz: a3.dz, pose, clip, r: d.r ?? 16, solid: d.solid !== false, box,
        on: true, vis: false, turns: !!TURNS[pose], name: d.name ?? NAMES[d.id] ?? NAMES[d.model] ?? '', label: d.label ?? '말을 건다', talkT: 0, acc: 0,
        portrait: PORTRAITS[d.model] ? d.model : null,
      });
    }
    for (const s of area.interact) {
      const gy = s.y ?? groundAt(W, s.x, s.z, Infinity);
      this.spots.push({ def: s, id: s.id, x: s.x, y: Number.isFinite(gy) ? gy : 0, z: s.z, r: s.r ?? 60, label: s.label ?? '살핀다', on: true });
    }
  }
  release(sc) {
    for (const p of this.list) if (sc && p.a3) sc._poolOf(p.a3.asset.id).push(p.a3);
    this.list.length = 0; this.spots.length = 0; this.target = null; this.talking = null;
  }
  byId(id) { for (const p of this.list) if (p.id === id) return p; return null; }
  /**
   * Once a rule tick: who is here (flags), who looks at the hero, which one prompt is offered.
   * flag(name) -> bool (story flags; the scene has built-in ones until the story is plugged in), hidden = Set of actor ids forced away.
   */
  tick(sc, dt, hero, enemies, flag, hidden, busy) {
    const L = this.list, tickN = ++this.tickN;
    // is a fight going on near the hero?
    let calm = true;
    for (let i = 0; i < enemies.length; i++) { const e = enemies[i]; if (e.dead || e.state === 'dead' || !e.active || e.buried) continue; const dx = e.x - hero.x, dz = e.z - hero.z; if (dx * dx + dz * dz < CALM2) { calm = false; break; } }
    this.calm = calm;
    let best = null, bd = 1e9, bestSpot = null;
    for (let i = 0; i < L.length; i++) {
      const p = L[i], d = p.def, on = !(hidden && hidden.has(p.id)) && (!d.when || flag(d.when));
      if (on !== p.on) { p.on = on; }
      if (p.box) p.box.solid = on && p.solid;
      if (!on) continue;
      const dx = hero.x - p.x, dz = hero.z - p.z, dist = Math.sqrt(dx * dx + dz * dz), a3 = p.a3;
      // body direction: towards the hero when he is near (and this pose can turn), otherwise back to the home direction
      if (p.turns) {
        const look = dist < NEAR && dist > 6 && !hero.dead, tx = look ? dx / dist : p.hx, tz = look ? dz / dist : p.hz;
        const cur = Math.atan2(a3.dz, a3.dx), ang = cur + wrapPi(Math.atan2(tz, tx) - cur) * (1 - Math.exp(-dt * 5)); a3.dx = Math.cos(ang); a3.dz = Math.sin(ang);
      }
      const want = this.talking === p && a3.asset.clips.talk1 && p.turns ? 'talk1' : p.clip;
      if (a3.anim.cur?.name !== want) a3.anim.play(want, { fade: 0.25 });
      // pose: visible people every tick when near, every 3rd tick further away, never when off screen
      p.acc += dt;
      if (p.vis && (dist < 700 || (tickN + i) % 3 === 0)) { a3.anim.update(p.acc); p.acc = 0; } else if (!p.vis) p.acc = 0;
      if (calm && !busy && dist < REACH + p.r && Math.abs(hero.y - p.y) < 60 && dist < bd) { bd = dist; best = p; bestSpot = null; }
    }
    const S = this.spots;
    for (let i = 0; i < S.length; i++) {
      const s = S[i]; if (!s.on) continue;
      const dx = hero.x - s.x, dz = hero.z - s.z, dist = Math.sqrt(dx * dx + dz * dz);
      if (calm && !busy && dist < s.r && Math.abs(hero.y - s.y) < 110 && dist < bd) { bd = dist; best = null; bestSpot = s; }
    }
    const t = best ?? bestSpot, P = this.prompt;
    this.target = t;
    if (t) { P.label = t.label; P.x = t.x; P.y = t.y + (best ? best.a3.height + 18 : 96); P.z = t.z; P.icon = best ? 'interact' : t.def.kind === 'bell' ? 'bell' : 'interact'; }
    return t ? this.shown : this.none;
  }
  /** draw the people that are on screen. seen(m, x, y, z, h) = the scene's frustum test, tint(x, y, z, out) = baked light at a point */
  draw(sc, cr, m, rim) {
    const L = this.list; let drawn = 0, culled = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i]; if (!p.on) { p.vis = false; continue; }
      // far from where the camera looks a person is a few fogged pixels at the full triangle cost: not drawn beyond FAR, faded in over the last 200 units
      const cdx = p.x - sc.cam.tx, cdz = p.z - sc.cam.tz, cd2 = cdx * cdx + cdz * cdz, a3 = p.a3;
      p.vis = cd2 < FAR2 && sc._seen(m, p.x, p.y, p.z, a3.height);
      if (!p.vis) { culled++; continue; }
      const o = a3.opt; sc._tintAt(sc.W, p.x, p.y + 50, p.z, 0, 1.6, o.tint);
      if (a3.tintK) { o.tint[0] *= a3.tintK[0]; o.tint[1] *= a3.tintK[1]; o.tint[2] *= a3.tintK[2]; }
      o.rim = rim; o.flash = 0; o.dis = 0; o.alpha = cd2 > NEAR2 ? Math.max(0.05, 1 - (Math.sqrt(cd2) - FADE0) / 200) : 1;
      a3.draw(cr, a3.place(p.x, p.y, p.z)); drawn++;
    }
    this.drawn = drawn; this.culled = culled;
  }
}
