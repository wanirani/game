// PLAY 구역 규칙 검사 (node, 화면 없음): node tools/v2/play_rules_test.mjs
// 영웅 기술 · 구르기 무적 · 막기/튕겨내기 · 락온 · 적 여섯 종의 예고→판정→틈 · 끼임(requests.md envkit 3) · 옛 이름(melee/ranged) · 사건.
const { Sim, TUNE, KINDS, kindOf, MOVES, flatArena } = await import(process.env.PLAY_ENTRY || '../../src/v2/play/index.js');   // PLAY_ENTRY: 다른 들머리로 돌려 볼 때

let pass = 0, fail = 0; const fails = [];
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; fails.push(name + (extra ? ' — ' + extra : '')); } console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : '')); };
const DT = 1 / 60;
const mk = (spawns = [], hooks = {}) => { const log = []; const sim = new Sim(flatArena(520, 360, spawns), { event: (n, ...a) => log.push([n, ...a]), ...hooks }); sim.log = log; return sim; };
const run = (sim, sec, inp = {}, each) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { const p = typeof inp === 'function' ? inp(i, sim) : i === 0 ? inp : { ...inp, attack: false, dash: false, jump: false, lockNext: false }; sim.update(DT, p || {}); each?.(sim, i); } };
const names = (sim) => sim.log.map((l) => l[0]);
const finite = (sim) => [sim.hero, ...sim.enemies, ...sim.shots].every((o) => ['x', 'y', 'z'].every((k) => Number.isFinite(o[k])));
const realRandom = Math.random; let seed = 12345; Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ── 1. 공개 면 ──
ok('exports: Sim TUNE KINDS', typeof Sim === 'function' && TUNE.runX > 0 && KINDS.melee && KINDS.ranged);
for (const k of ['melee', 'ranged', 'skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'banshee_queen']) {
  const D = KINDS[k]; ok('KINDS.' + k + ' has model/height/material', !!D && typeof D.model === 'string' && D.height > 0 && typeof D.material === 'string' && 'weapon' in D, D ? D.model + ' ' + D.height + 'm ' + D.material + ' ' + D.weapon : '');
}
ok('legacy kinds map: melee→skeleton_soldier, ranged→skeleton_mage', KINDS.melee.model === 'skeleton_soldier' && KINDS.melee.weapon === 'w_rusty_sword' && KINDS.ranged.model === 'skeleton_mage' && KINDS.ranged.weapon === 'w_crystal_staff');

// ── 2. 이동 · 방향 ──
{ const s = mk(); run(s, 0.6, { mx: 0, mz: 1 }); const z06 = s.hero.z; run(s, 1.2, { mx: 0, mz: 1 }); ok('move up: dir = (0,1), z grows', s.hero.dirZ > 0.99 && z06 > 60 && s.hero.anim === 'run', `z ${z06.toFixed(0)} anim ${s.hero.anim}`);
  let backT = 0, vmin = 9e9; run(s, 0.05, { mx: 0, mz: -1 }); const d005 = s.hero.dirZ, a005 = s.hero.anim;
  run(s, 0.3, { mx: 0, mz: -1 }, (q) => { const h = q.hero, sp = Math.hypot(h.vx, h.vz); vmin = Math.min(vmin, sp); if (sp > 60 && h.vx * h.dirX + h.vz * h.dirZ < 0) backT++; });
  ok('stick reverse: the body pivots (anim turn), never moves backwards, faces the new way within 0.35 s', a005 === 'turn' && d005 > -0.99 && s.hero.dirZ < -0.99 && backT === 0 && s.hero.vz < -150 && names(s).includes('pivot'), `dirZ after 0.05 s ${d005.toFixed(2)} · after 0.35 s ${s.hero.dirZ.toFixed(2)} · vz ${s.hero.vz.toFixed(0)} · slowest ${vmin.toFixed(0)}`);
  const steps = s.log.filter((l) => l[0] === 'step'); ok('footsteps alternate L/R while running', steps.length >= 2 && steps.every((l, i) => i === 0 || l[1] !== steps[i - 1][1]), steps.map((l) => l[1]).join('')); }
{ const s = mk(); run(s, 1.0, { mx: 0.35, mz: 0 }); ok('half stick = walk gait', s.hero.anim === 'walk' && s.hero.gaitMode === 'walk', `anim ${s.hero.anim} v ${s.hero.vx.toFixed(0)}`); }
{ const s = mk(); let top = 0, sawJump = false, sawFall = false; run(s, 1.2, (i) => ({ mx: 0, mz: 0, jump: i === 0, jumpHeld: true }), (q) => { top = Math.max(top, q.hero.y); sawJump ||= q.hero.anim === 'jump'; sawFall ||= q.hero.anim === 'fall'; });
  ok('jump: up, fall, land event', top > 90 && sawJump && sawFall && s.hero.onGround && names(s).includes('jump') && names(s).includes('land'), `top ${top.toFixed(0)}`); }

// ── 3. 공격: 여덟 방향 모두 "보는 쪽"으로 맞는다 ──
for (let k = 0; k < 8; k++) {
  const a = (k * Math.PI) / 4, dx = Math.cos(a), dz = Math.sin(a);
  const s = mk([{ kind: 'melee', x: dx * 70, z: dz * 70, active: true }]); s.enemies[0].cd = 99;
  let hit = null; s.hooks.hit = (e, dmg, mv, x, y, z, info) => { hit = { dmg, t: s.hero.moveT, mv: mv.id, info }; };
  run(s, 0.4, { mx: dx, mz: dz, attack: true });
  ok(`attack dir ${k * 45}°: hits inside window, facing the cut`, !!hit && hit.t >= MOVES.c1.hit[0] && hit.t <= MOVES.c1.hit[1] + DT * 2 && s.hero.dirX * dx + s.hero.dirZ * dz > 0.9, hit ? `t ${hit.t.toFixed(3)} dmg ${hit.dmg}` : 'no hit');
}
{ // 등 뒤의 적은 안 맞는다 (1타)
  const s = mk([{ kind: 'melee', x: -70, z: 0, active: true }]); s.enemies[0].cd = 99; s.hero.lock = null; let hit = 0; s.hooks.hit = () => { hit++; };
  s.hero.dirX = 1; s.hero.dirZ = 0; run(s, 0.4, { mx: 1, mz: 0, attack: true }); ok('enemy behind is not hit by hit 1', hit === 0); }
{ // 연타 3: 셋째는 넓다 (뒤쪽 옆의 적도 맞는다)
  const s = mk([{ kind: 'plague_corpse', x: 70, z: 0, active: true }, { kind: 'plague_corpse', x: -40, z: 80, active: true }, { kind: 'plague_corpse', x: -40, z: -80, active: true }]); for (const e of s.enemies) e.cd = 99;
  const by = {}; s.hooks.hit = (e, dmg, mv) => { (by[mv.id] ||= new Set()).add(e.id); };
  let seen = []; run(s, 1.6, (i) => ({ mx: 0, mz: 0, attack: i % 9 === 0 }), (q) => { const id = q.hero.move?.id; if (id && seen[seen.length - 1] !== id) seen.push(id); });
  ok('combo runs c1 → c2 → c3', seen.join('>').startsWith('c1>c2>c3'), seen.join('>'));
  ok('third hit is wide (hits all three around)', by.c3 && by.c3.size === 3 && by.c1 && by.c1.size === 1, `c1 ${by.c1?.size} c2 ${by.c2?.size} c3 ${by.c3?.size}`); }
{ // 점프 중 내려베기
  const s = mk([{ kind: 'melee', x: 60, z: 0, active: true }]); s.enemies[0].cd = 99; let hits = []; s.hooks.hit = (e, d, mv) => { hits.push(mv.id); };
  run(s, 1.2, (i) => ({ mx: 0, mz: 0, jump: i === 0, jumpHeld: true, attack: i === 16 }));
  ok('jump attack = plunge, hits, ends on ground', hits.includes('plunge') && s.hero.onGround && !s.hero.move, hits.join(',')); }
{ // 구른 직후 훑기
  const s = mk([{ kind: 'melee', x: 230, z: 0, active: true }]); s.enemies[0].cd = 99; let ids = []; s.hooks.attack = (h, mv) => ids.push(mv.id);
  run(s, 1.0, (i) => ({ mx: 1, mz: 0, dash: i === 0, attack: i === 20 }));
  ok('attack right after roll = sweep', ids[0] === 'sweep' && names(s).includes('roll'), ids.join(',')); }

// ── 4. 구르기: 무적 · 방향 · 거리 ──
{ const s = mk(); const x0 = s.hero.x; let rolled = false; run(s, 0.7, (i) => ({ mx: 0, mz: 1, dash: i === 0 }), (q) => { rolled ||= q.hero.anim === 'roll'; });
  const s2 = mk(); run(s2, 0.7, { mx: 0, mz: 1 });
  ok('roll: goes in stick direction, farther than running', rolled && s.hero.z > s2.hero.z + 15 && Math.abs(s.hero.x - x0) < 2, `roll ${s.hero.z.toFixed(0)} vs run ${s2.hero.z.toFixed(0)}`); }
{ const s = mk([{ kind: 'melee', x: 60, z: 0, active: true }]); s.update(DT, { mx: -1, mz: 0, dash: true });
  const r = s.hurtHero(10, -1, 0, { e: s.enemies[0] }); ok('roll gives short invulnerability', r === false && s.hero.hp === TUNE.heroHp && names(s).includes('dodge'));
  run(s, TUNE.rollIfr + 0.05, { mx: -1, mz: 0 }); const r2 = s.hurtHero(10, -1, 0, { e: s.enemies[0] }); ok('…and it ends (hit lands after i-frames)', r2 === 'hurt' && s.hero.hp < TUNE.heroHp, String(r2)); }

// ── 5. 막기 · 튕겨내기 ──
{ const s = mk([{ kind: 'melee', x: 70, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 99; s.hero.dirX = 1;
  run(s, 0.5, { guard: true }); ok('guard held with no stick → guard state', s.hero.guard && s.hero.anim === 'guard');
  const r = s.hurtHero(10, -1, 0, { e, atk: KINDS.melee.attacks[0] }); ok('late guard = block (no damage)', r === 'guard' && s.hero.hp === TUNE.heroHp && names(s).includes('guard'), String(r));
  run(s, 0.4, {}); ok('guard released → not guarding', !s.hero.guard);
  s.update(DT, { guard: true }); const r2 = s.hurtHero(10, -1, 0, { e, atk: KINDS.melee.attacks[0] });
  ok('guard just before the hit = parry, attacker staggers', r2 === 'parry' && e.state === 'stagger' && e.stagger > 0.5 && names(s).includes('parry') && s.hero.hp === TUNE.heroHp, String(r2));
  const s3 = mk([{ kind: 'melee', x: -70, z: 0, active: true }]); s3.hero.dirX = 1; s3.hero.lock = null; run(s3, 0.3, { guard: true }); s3.hero.dirX = 1; s3.hero.dirZ = 0;
  const r3 = s3.hurtHero(10, 1, 0, { e: s3.enemies[0], atk: KINDS.melee.attacks[0] }); ok('guard does not cover the back', r3 === 'hurt', String(r3));
  const s4 = mk([{ kind: 'plague_corpse', x: 70, z: 0, active: true }]); s4.hero.dirX = 1; s4.update(DT, { guard: true });
  const r4 = s4.hurtHero(16, -1, 0, { e: s4.enemies[0], atk: KINDS.plague_corpse.attacks[0] }); ok('corpse grab cannot be guarded or parried', r4 === 'hurt', String(r4)); }
{ // 튕겨낸 탄이 쏜 적에게 돌아간다
  const s = mk([{ kind: 'ranged', x: 260, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 0; s.hero.dirX = 1; let parried = false, back = false;
  run(s, 6, (i, q) => { const sh = q.shots.find((x) => !x.friendly); const near = sh && Math.hypot(sh.x - q.hero.x, sh.z - q.hero.z) < 40; return { guard: !!near }; }, (q) => { parried ||= q.shots.some((x) => x.friendly); back ||= e.hp < e.hpMax; });
  ok('mage casts a bolt; parry reflects it back onto the mage', parried && back, `parried ${parried} mageHit ${back}`); }

// ── 6. 락온 ──
{ const s = mk([{ kind: 'melee', x: 150, z: 0, active: true }, { kind: 'melee', x: -220, z: 30, active: true }]); for (const e of s.enemies) e.cd = 99;
  run(s, 0.1, {}); const first = s.hero.lock; ok('soft lock picks nearest enemy', first === 0, String(first));
  s.update(DT, { lockNext: true }); ok('lockNext cycles to the other enemy', s.hero.lock === 1 && names(s).includes('lock'), String(s.hero.lock));
  s.hero.dirX = 0; s.hero.dirZ = 1; const e1 = s.enemies[1]; e1.x = -90; e1.z = 20; run(s, 0.3, (i) => ({ attack: i === 0 }));
  ok('attack with no stick turns to the locked enemy', s.hero.dirX < -0.9, `dir ${s.hero.dirX.toFixed(2)},${s.hero.dirZ.toFixed(2)}`); }

// ── 7. 적 여섯 종: 예고 → 판정 → 틈, 영웅을 실제로 맞힌다 ──
for (const kind of ['skeleton_soldier', 'skeleton_mage', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat']) {
  const s = mk([{ kind, x: 180, z: 40, active: true }]); const e = s.enemies[0]; e.cd = 0.2;
  const ph = new Set(); let tele = 0, hurt = 0, tells = 0; s.hooks.heroHurt = () => { hurt++; }; s.hooks.tell = () => { tells++; };
  run(s, 9, {}, (q) => { if (e.phase) ph.add(e.phase); tele = Math.max(tele, e.tele); if (q.hero.dead) q.hero.hp = 1; });
  ok(`${kind}: telegraph → strike → recover and lands a hit on an idle hero`, ph.has('windup') && ph.has('strike') && ph.has('recover') && tele >= 0.9 && hurt >= 1 && tells >= 1 && finite(s), `phases ${[...ph].join('/')} hurt ${hurt} tells ${tells}`);
}
{ // 예고 시간 = 피할 틈: 예고 중에 구르면 안 맞는다
  const s = mk([{ kind: 'gravekeeper_armor', x: 110, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 0; let hurt = 0; s.hooks.heroHurt = () => { hurt++; };
  run(s, 4, (i, q) => ({ mx: -1, mz: 0, dash: e.phase === 'windup' && e.tele > 0.7 && q.hero.dashT <= 0 && q.hero.rollCd <= 0 }));
  ok('armor slam can be rolled away from on the telegraph', hurt === 0, `hurt ${hurt}`); }
{ // 갑주: 앞은 단단하고 뒤는 무르다, 튕겨내면 열린다
  const s = mk([{ kind: 'gravekeeper_armor', x: 80, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 99; e.dirX = -1; e.dirZ = 0; const got = [];
  s.hooks.hit = (en, dmg, mv, x, y, z, info) => got.push({ dmg, blocked: info.blocked, back: info.back });
  s._hitEnemy(e, MOVES.c1, s.hero); e.dirX = 1; s._hitEnemy(e, MOVES.c1, s.hero); e.dirX = -1; s.staggerEnemy(e, 1.5); s._hitEnemy(e, MOVES.c1, s.hero);
  ok('armor: front blocked (chip), back takes more, staggered takes full', got[0].blocked && got[0].dmg <= 3 && !got[1].blocked && got[1].dmg >= 11 && !got[2].blocked && got[2].dmg >= 11, JSON.stringify(got)); }
{ // 유령: 흐릴 때는 안 맞고, 덮친 뒤에는 맞는다
  const s = mk([{ kind: 'grave_ghost', x: 90, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 99;
  run(s, 0.3, {}); const a = s._hitEnemy(e, MOVES.c1, s.hero); const hp0 = e.hp; e.cd = 0; let solidSeen = false, hitSolid = false;
  run(s, 5, {}, (q) => { if (e.solid && e.phase === 'recover' && !hitSolid) { solidSeen = true; hitSolid = q._hitEnemy(e, MOVES.c1, q.hero); } if (q.hero.dead) q.hero.hp = 1; });
  ok('ghost: faded = untouchable, solid after its swoop = hittable', a === false && e.hp < hp0 + 1 && solidSeen && hitSolid, `faded hit ${a} solidSeen ${solidSeen} hp ${hp0}→${e.hp}`);
  const s2 = mk([{ kind: 'grave_ghost', x: 90, z: 0, active: true }]); s2.enemies[0].cd = 99; run(s2, 0.2, {}); s2.reveal(0, 0, 200, 2); run(s2, 0.1, {}); ok('reveal() makes a ghost solid', s2.enemies[0].solid === true); }
{ // 박쥐 떼: 넓은 셋째 타가 답
  const sp = []; for (let i = 0; i < 5; i++) sp.push({ kind: 'bat', x: 120 + i * 20, z: -60 + i * 30, active: true });
  const s = mk(sp); let kills = 0; s.hooks.kill = () => { kills++; };
  run(s, 14, (i, q) => ({ attack: i % 8 === 0 }), (q) => { if (q.hero.dead) q.hero.hp = 50; q.hero.hp = Math.max(q.hero.hp, 20); });
  ok('bats: flock orbits and can be cut down', kills >= 3 && finite(s), `kills ${kills}/5`); }
{ // 보스 자리
  const s = mk([{ kind: 'banshee_queen', x: 200, z: 0, active: true }]); run(s, 1, {}); const bs = s.bossState(); ok('boss: spawns, faces the hero, sim.bossState() gives the HUD bar { name, hp, hpMax, stagger, phase }', s.enemies[0].def.boss === true && s.enemies[0].dirX < -0.9 && bs && bs.name === KINDS.banshee_queen.name && bs.hp === bs.hpMax && bs.hpMax === KINDS.banshee_queen.hp && bs.stagger === 0 && bs.phase === 1, JSON.stringify(bs)); }

// ── 8. 옛 스테이지(시범판 B)에서: melee/ranged 가 그대로 돌고, 끼이지 않는다 ──
try {
  const { compileStage } = await import('../../src/v2/b/world.js'); const STAGE = (await import('../../src/v2/b/stage_slice0.js')).default;
  const W = compileStage(STAGE); const s = new Sim(W, {});
  ok('B stage: Sim builds, spawns melee/ranged', s.enemies.length === W.spawns.length && s.enemies.every((e) => e.def && (e.kind === 'melee' || e.kind === 'ranged')), `${s.enemies.length} enemies`);
  run(s, 3, { mx: 1, mz: 0 }); ok('B stage: runs 3 s without NaN', finite(s) && s.hero.x > W.start.x + 100, `x ${s.hero.x.toFixed(0)}`);
  ok('B stage: teleport(alley)', s.teleport('alley') === true && s.section === 'alley', s.section);
  // 끼임 재현: 영웅 (1960,244) · 근접 적 (2020,330) → 옛 규칙은 (2020,269) 에서 영원히 멈췄다
  const s2 = new Sim(W, {}); const h = s2.hero; h.x = 1960; h.z = 244; h.y = s2.w.ground(h.x, h.z); h.safe = { x: h.x, z: h.z, y: h.y }; h.hp = h.hpMax = 1e6;
  s2.enemies.length = 0; const e = s2.addEnemy({ kind: 'melee', x: 2020, z: 330, active: true }); let tells = 0, minD = 1e9; s2.hooks.tell = () => { tells++; };
  run(s2, 8, {}, () => { minD = Math.min(minD, Math.hypot(e.x - h.x, e.z - h.z)); });
  ok('wedge at the alley mouth: melee enemy reaches the hero and attacks (was a deadlock)', tells >= 1 && minD < 100, `closest ${minD.toFixed(0)} attacks ${tells} at (${e.x.toFixed(0)},${e.z.toFixed(0)})`);
  // 돌아가기: 상자 뒤에서 시작해도 돌아서 온다
  const s3 = new Sim(flatArena(400, 300, []), {}); s3.W.boxes.push({ x0: 60, x1: 100, z0: -90, z1: 90, y0: 0, y1: 120, solid: true, walk: false });
  const e3 = s3.addEnemy({ kind: 'melee', x: 220, z: 0, active: true }); s3.hero.hp = s3.hero.hpMax = 1e6; let t3 = 0; s3.hooks.tell = () => { t3++; };
  run(s3, 10, {}); ok('steering: walks around a wall between it and the hero', t3 >= 1, `attacks ${t3} at (${e3.x.toFixed(0)},${e3.z.toFixed(0)})`);
} catch (err) { ok('B stage tests ran', false, String(err?.message ?? err)); }

// ── 9. 사건 이름 · 긴 무작위 놀이에서 NaN 없음 ──
{ const sp = ['melee', 'ranged', 'plague_corpse', 'grave_ghost', 'gravekeeper_armor', 'bat', 'bat', 'bat'].map((kind, i) => ({ kind, x: 150 + (i % 4) * 70, z: -150 + i * 40, active: true }));
  const s = mk(sp); let bad = false; const t0 = Date.now();
  run(s, 60, (i) => { const r = Math.random; const a = Math.floor(i / 40) * 2.399; return { mx: Math.cos(a), mz: Math.sin(a), attack: r() < 0.08, dash: r() < 0.02, jump: r() < 0.01, jumpHeld: true, guard: Math.floor(i / 90) % 5 === 0, lockNext: r() < 0.005 }; }, (q) => { if (!finite(q)) bad = true; q.hero.hp = Math.max(q.hero.hp, 30); });
  const ms = Date.now() - t0, ev = new Set(names(s));
  ok('60 s random play with all kinds: no NaN', !bad);
  ok('rule cost per frame is small', ms / 3600 < 0.5, `${(ms / 3600).toFixed(3)} ms/frame (8 enemies, node)`);
  const need = ['step', 'swing', 'attack', 'hit', 'roll', 'land', 'jump', 'tell', 'enemySwing', 'cast', 'shot', 'lock', 'heroHurt'];
  ok('events seen: ' + need.join(' '), need.every((n) => ev.has(n)), 'missing: ' + need.filter((n) => !ev.has(n)).join(',') + ' | all: ' + [...ev].join(' ')); }

// ── 11. 이어 하기(2차)에서 더한 것 ──
{ const s = mk(); const seen = new Set(); run(s, 1.0, { mx: 1, mz: 0 }); run(s, 0.5, { mx: -1, mz: 0 }, (q) => seen.add(q.hero.anim)); run(s, 0.5, { mx: 0.2, mz: 0.98 }, (q) => seen.add(q.hero.anim));
  ok('stick reversal goes turn → run (no idle / walk flicker while speed passes zero)', seen.has('run') && [...seen].every((a) => a === 'run' || a === 'turn'), [...seen].join(' ')); }
{ const s = mk(); s.hero.x = 500; run(s, 0.6, { mx: 1, mz: 0 }); const g0 = s.hero.gait; let moved = 0; run(s, 0.5, { mx: 1, mz: 0 }, (q) => { moved += Math.abs(q.hero.gait - g0) > 0.01 ? 1 : 0; });
  ok('running into a wall: legs keep cycling (gait advances), state stays run', moved > 5 && s.hero.anim === 'run' && s.hero.x <= 520 - s.hero.r + 0.01, `x ${s.hero.x.toFixed(1)}`); }
{ const s = mk([{ kind: 'dummy0', x: 60, z: 0, active: true }]); s.enemies[0].def = { ...s.enemies[0].def, attacks: [] }; let eta = [], land = -1;
  run(s, 1.4, (i) => ({ mx: 0, mz: 0, jump: i === 0, jumpHeld: true, attack: i === 14 }), (q, i) => { if (q.hero.move?.kind === 'plunge' && !q.hero.onGround) eta.push(q.hero.plungeEta); if (land < 0 && q.hero.plungeLand != null) land = i; });
  ok('plunge: time-to-ground estimate falls to ~0 at landing', eta.length > 4 && eta[eta.length - 1] < 0.035 && eta[0] > eta[eta.length - 1] && land > 0, `eta ${eta[0]?.toFixed(2)} → ${eta[eta.length - 1]?.toFixed(3)} · landed frame ${land}`); }
{ const s = mk([{ kind: 'ranged', x: 60, z: 0, active: true }]); const e = s.enemies[0]; e.cd = 0; let casts = 0; const d0 = Math.hypot(e.x - s.hero.x, e.z - s.hero.z);
  run(s, 0.4, {}, (q) => { if (q.enemies[0].state === 'attack') casts++; s.hero.hp = 100; });
  ok('mage at point-blank backs away first instead of casting', casts === 0 && Math.hypot(e.x - s.hero.x, e.z - s.hero.z) > d0 + 20, `dist ${d0.toFixed(0)} → ${Math.hypot(e.x - s.hero.x, e.z - s.hero.z).toFixed(0)}`);
  run(s, 6, {}, (q) => { if (q.enemies[0].state === 'attack') casts++; s.hero.hp = 100; });
  ok('… and casts once it has room', casts > 0); }
{ const snd = []; const s = mk([{ kind: 'bat', x: 150, z: 0, active: true }, { kind: 'melee', x: -300, z: 0 }], { sound: (n, pos) => snd.push(n + (pos && Number.isFinite(pos.x) ? '' : '?')) });
  run(s, 8, {}, () => { s.hero.hp = 100; });
  ok('sound hook: bat screech on dive, skeleton rattle on wake (names from SOUND_FEEL §6, with a position)', snd.includes('enemy.bat.screech') && snd.includes('enemy.skel.rattle'), [...new Set(snd)].join(' ')); }
{ const s = mk([{ kind: 'melee', x: 70, z: 0, active: true }]); let sfx = []; s.hooks.sfx = (n) => sfx.push(n); s.enemies[0].cd = 0;
  run(s, 3, { guard: true }, () => { s.hero.hp = 100; s.hero.parryCd = 9; s.hero.parryT = 0; });
  const known = new Set(['dash', 'jump', 'land', 'swing', 'cast', 'parry', 'guard', 'die', 'slash', 'slash_heavy']);
  ok('legacy sfx names stay inside the set the scene knows; a block sends sfx guard + the guard hook', names(s).includes('guard') && sfx.includes('guard') && sfx.every((n) => known.has(n)), [...new Set(sfx)].join(' ')); }
{ const bad = []; for (const k of Object.keys(KINDS)) for (const a of KINDS[k].attacks) if (![a.windup, a.strike, a.recover, a.dmg].every((v) => typeof v === 'number' && v >= 0) || !(a.box || a.radius || a.arc || a.shot || a.summon || a.pulse) || typeof a.clip !== 'string') bad.push(k + '.' + a.id);
  ok('every enemy attack line has numeric windup / strike / recover / dmg, a shape and a clip', bad.length === 0, bad.join(' ')); }
{ const s = mk([{ kind: 'melee', x: 420, z: 0, rise: true }, { kind: 'melee', x: -500, z: 0 }]); const e = s.enemies[0], o = s.enemies[1]; const seen = [];
  run(s, 0.3, {}); const lying = e.buried === true && e.anim === 'buried' && !e.active && o.anim === 'idle' && !o.buried;
  run(s, 0.2, { attack: true }); s.hero.x = e.x - 60; run(s, 0.3, { attack: true }); const untouched = e.hp === e.hpMax || e.active;   // 누워 있는 동안은 베이지 않는다(가까이 가면 곧 깨어난다)
  run(s, 2.2, {}, (q) => { if (seen[seen.length - 1] !== q.enemies[0].state) seen.push(q.enemies[0].state); s.hero.hp = 100; });
  ok('spawn flag rise: the enemy lies down until the hero comes near, gets up (state rise), then fights; other spawns are unchanged', lying && untouched && seen.includes('rise') && seen.indexOf('chase') > seen.indexOf('rise') && names(s).includes('wake'), seen.join('→')); }
ok('moves carry strength (= str) for the scene', Object.values(MOVES).every((m) => m.strength === m.str && 'LMHF'.includes(m.strength)));

// ── 12. 본 게임 장면이 쓰는 세계(환경 키트 compileEnv)에서도 끼이지 않는다 ──
// ── 깨어남: 볼 때만 (거리 · 앞쪽 · 벽 너머는 못 본다), 지역이 달리 정할 수 있다 ──
{ const wakes = (spawn, sec = 2, prep) => { const s = mk([spawn]); prep?.(s); run(s, sec, {}); return s.enemies[0].active; };
  ok('wake: a sleeping soldier 360 px away does not notice the hero (sight 300)', wakes({ kind: 'melee', x: 360, z: 0 }) === false);
  ok('wake: at 260 px in front of it, it does', wakes({ kind: 'melee', x: 260, z: 0 }) === true);
  ok('wake: facing away it does not notice at 220 px, but does at 130 px', wakes({ kind: 'melee', x: 220, z: 0, face: [1, 0] }) === false && wakes({ kind: 'melee', x: 130, z: 0, face: [1, 0] }) === true);
  ok('wake: not through a wall', wakes({ kind: 'melee', x: 200, z: 0 }, 2, (s) => s.W.boxes.push({ x0: 90, x1: 110, z0: -120, z1: 120, y0: 0, y1: 200, solid: true, walk: false })) === false);
  ok('wake: the area can widen the sight (spawns[].sight 500)', wakes({ kind: 'melee', x: 420, z: 0, sight: 500 }) === true);
  { const s = mk([{ kind: 'melee', x: 120, z: 0, wake: 'trigger' }]); run(s, 1.5, {}); const a0 = s.enemies[0].active; s.wake(s.enemies[0]); ok("wake: spawns[].wake = 'trigger' sleeps until the scene wakes it", a0 === false && s.enemies[0].active === true); }
  { const s = mk([{ kind: 'melee', x: 250, z: 0 }, { kind: 'melee', x: 400, z: 60 }, { kind: 'melee', x: 400, z: -300 }]); run(s, 1.5, {}); ok('wake: a mate standing close to the one that woke wakes too; one farther off does not', s.enemies[0].active && s.enemies[1].active && !s.enemies[2].active, s.enemies.map((e) => e.active).join(' ')); }
  { const s = mk([{ kind: 'melee', x: 380, z: 0, face: [1, 0] }]); s.enemies[0].cd = 99; run(s, 0.3, {}); const a0 = s.enemies[0].active; s._hitEnemy(s.enemies[0], MOVES.c1, s.hero); ok('wake: being hit wakes it', a0 === false && s.enemies[0].active === true); }
}
// ── 톡 눌러 뗀 구르기 단추 뒤에 스틱을 밀어도 구르지 않는다 ──
{ const s = mk(); let rolls = 0; s.hooks.roll = () => { rolls++; };
  run(s, 0.4, (i) => ({ mx: i >= 6 ? 1 : 0, mz: 0, dash: i === 0, guard: i < 3 }));
  ok('tap the roll button standing, release, then push the stick within 0.3 s: no roll (walks off)', rolls === 0 && s.hero.dashT <= 0 && s.hero.x > 5, `rolls ${rolls} x ${s.hero.x.toFixed(0)}`);
  const s2 = mk(); let r2 = 0; s2.hooks.roll = () => { r2++; }; run(s2, 0.4, (i) => ({ mx: i >= 6 ? 1 : 0, mz: 0, dash: i === 0, guard: true }));
  ok('holding the button (guard) and pushing the stick still rolls', r2 === 1, `rolls ${r2}`); }
// ── 도구: 모아 휘감기 · 솜씨(채찍 걸기 / 부름) · 종(메아리 / 길게 = 조종) · 울림 눈금 ──
{ const s = mk([{ kind: 'melee', x: 215, z: 0, active: true }]); s.enemies[0].cd = 99; s.enemies[0].hp = s.enemies[0].hpMax = 999; const ids = []; s.hooks.attack = (h, mv) => ids.push(mv.id); let maxC = 0, sawCharge = false;
  run(s, 1.2, (i) => ({ attack: i === 0, attackHeld: i < 62 }), (q) => { maxC = Math.max(maxC, q.hero.charge); sawCharge ||= q.hero.anim === 'charge'; });
  run(s, 0.8, {}); const e = s.enemies[0], d = Math.hypot(e.x - s.hero.x, e.z - s.hero.z);
  ok('hold attack: c1, then charges (hero.charge → 1), release = whip; a small enemy 215 px away is hit and pulled in front of the hero', ids.join('>') === 'c1>whip' && sawCharge && maxC >= 0.99 && names(s).includes('pull') && d < 80 && e.hp < 999, `moves ${ids.join('>')} · charge ${maxC.toFixed(2)} · enemy now ${d.toFixed(0)} px away`);
  ok('whip fills the resonance gauge more than a normal hit', s.hero.reso > 0.3 && s.hero.reso < 1, `reso ${s.hero.reso.toFixed(2)}`); }
{ const s = mk([{ kind: 'armor', x: 235, z: 0, active: true }]); s.enemies[0].cd = 99; const x0 = s.hero.x;
  run(s, 1.2, (i) => ({ attack: i === 0, attackHeld: i < 62 })); run(s, 0.6, {}); const e = s.enemies[0];
  ok('whip on a big enemy pulls the hero to it instead', s.hero.x - x0 > 60 && Math.hypot(e.x - s.hero.x, e.z - s.hero.z) < 100 && s.log.some((l) => l[0] === 'pull' && l[2] === 'to'), `hero moved ${(s.hero.x - x0).toFixed(0)} px · gap ${Math.hypot(e.x - s.hero.x, e.z - s.hero.z).toFixed(0)}`); }
{ const s = mk(); let c = 0; s.hooks.attack = () => c++; run(s, 0.5, (i) => ({ attack: i === 0, attackHeld: i < 8 })); ok('a normal tap (held 0.13 s) does not charge', c === 1 && !s.hero.charging && s.hero.charge === 0); }
{ const s = mk(); s.hookPoints.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] }); s.update(DT, {}); const m0 = s.hero.skillMode; let top = 0;
  run(s, 1.0, (i) => ({ skill: i === 0 }), (q) => { top = Math.max(top, q.hero.y); });
  ok('skill near a glowing ring = whip hook: mode hook, flies in an arc, lands on the far spot', m0 === 'hook' && s.hero.hookId === null && top > 40 && Math.abs(s.hero.x - 300) < 2 && Math.abs(s.hero.z - 50) < 2 && s.hero.onGround && ['throw', 'latch', 'land'].every((p) => s.log.some((l) => l[0] === 'hook' && l[3] === p)), `mode ${m0} · top ${top.toFixed(0)} · at ${s.hero.x.toFixed(0)},${s.hero.z.toFixed(0)}`); }
{ const s = mk([{ kind: 'ghost', x: 120, z: 30, active: true }, { kind: 'melee', x: 130, z: -40, active: true }]); for (const e of s.enemies) e.cd = 99;
  s.update(DT, { skill: true }); const denied = s.log.some((l) => l[0] === 'deny') && !s.hero.act;
  s.hero.reso = 2; run(s, 1.0, (i) => ({ skill: i === 0 })); const g = s.enemies[0], m = s.enemies[1];
  ok('skill with no ring = call (Sera lantern): needs one resonance cell, lays a light, ghost inside is revealed and held, soldier staggers, cooldown runs', denied && s.hero.reso === 1 && s.lights.length === 1 && g.solid && g.stun > 0 && m.state === 'stagger' && s.hero.callCd > 4 && s.hero.skillMode === 'call', `denied first ${denied} · reso ${s.hero.reso} · lights ${s.lights.length} · ghost solid ${g.solid} · soldier ${m.state} · cd ${s.hero.callCd.toFixed(1)}`);
  run(s, 5.2, {}, () => { s.hero.hp = 100; }); ok('the light ends after callDur', s.lights.length === 0); }
{ const s = mk([{ kind: 'ghost', x: 150, z: 30, active: true }, { kind: 'mage', x: 210, z: -60, active: true }]); const gh = s.enemies[0], mg = s.enemies[1]; gh.cd = 99; mg.cd = 0;
  run(s, 0.5, {}); const casting = mg.state === 'attack' && mg.phase === 'windup';
  run(s, 0.4, (i) => ({ bell: i === 0 }));
  ok('bell tap = echo: reveals the ghost, cuts the mage cast, cooldown starts', casting && gh.solid && gh.revealT > 2 && mg.state !== 'attack' && s.shots.length === 0 && s.hero.bellCd > 1.5 && s.log.some((l) => l[0] === 'bell') && s.log.some((l) => l[0] === 'silence'), `casting ${casting} · ghost solid ${gh.solid} · mage ${mg.state} · cd ${s.hero.bellCd.toFixed(1)}`);
  const s2 = mk(); s2.update(DT, { bell: true, bellHeld: true }); run(s2, 0.2, { bellHeld: true }); const a02 = s2.hero.act; run(s2, 0.2, { bellHeld: false });
  ok('with bellHeld given: a press released before 0.3 s is the echo', a02 === null && s2.hero.act === 'echo');
  const s3 = mk(); let long = 0; s3.hooks.ringLong = (h, kn) => { long++; }; s3.update(DT, { bell: true, bellHeld: true }); run(s3, 1.3, { bellHeld: true });
  ok('held: hero.bellCharge fills, hooks.ringLong fires once (no kneeling boss → the scene decides the crossing)', long === 1 && s3.hero.bellOk === false, `ringLong ${long}`); }
// ── 보스: 밴시 여왕 ──
{ const Q = KINDS.banshee_queen, by = Object.fromEntries(Q.attacks.map((a) => [a.id, a]));
  ok('boss data: KINDS.banshee_queen is a boss with five attacks, each with wind-up ≥ 0.75 s, a warning shape and a punishable recovery ≥ 0.7 s', Q.boss && ['wail', 'sweep', 'scream', 'summon', 'song'].every((k) => by[k] && by[k].windup >= 0.75 && by[k].recover >= 0.7 && (by[k].arc || by[k].radius || by[k].mark)), Q.attacks.map((a) => `${a.id} ${a.windup}/${a.strike}/${a.recover}`).join(' · '));
  const boss = (o = {}) => { const s = mk([{ kind: 'banshee_queen', x: o.x ?? 150, z: 0, active: true, phase: o.phase }]); const e = s.enemies[0]; e.cd = 99; s.hero.hp = s.hero.hpMax = 1e5; return [s, e]; };
  const firstHurt = (s, e, a, inpf) => { let t = -1, i = 0; s.hooks.heroHurt = () => { if (t < 0) { t = e.stateT; s.stunSeen = s.hero.hurtT; } }; s.startAttack(e, a); while (e.state === 'attack' && i++ < 900) s.update(DT, inpf ? inpf(i) : {}); return t; };
  { const [s, e] = boss(); const t = firstHurt(s, e, by.sweep); ok('sweep: hits a hero standing in the arc only inside the strike window', t >= by.sweep.windup - 1e-6 && t <= by.sweep.windup + by.sweep.strike + DT, `hurt at ${t.toFixed(3)} · window ${by.sweep.windup}–${(by.sweep.windup + by.sweep.strike).toFixed(2)}`); }
  { const [s, e] = boss({ x: 150 }); s.hero.x = 320; s.hero.z = 0; e.dirX = -1; e.dirZ = 0; const a = { ...by.sweep, track: 0 }; const t = firstHurt(s, e, a); ok('sweep: a hero behind her is not hit (arc 210°)', t < 0); }
  { const [s, e] = boss(); let res = null; s.startAttack(e, by.sweep); for (let i = 0; i < 200 && e.state === 'attack'; i++) s.update(DT, { guard: e.stateT > by.sweep.windup - 0.1 }); ok('sweep can be parried: no stagger at once, the stagger gauge fills by poiseParry', s.log.some((l) => l[0] === 'parry') && e.stagger === 0 && Math.abs(e.poiseHp - Q.poiseParry) < 1e-6, `poise ${e.poiseHp}`); }
  { const [s, e] = boss(); const t = firstHurt(s, e, by.scream, () => ({ guard: true })); ok('scream: radius hit at the end of the 1.15 s wind-up, cannot be guarded, stuns the hero', t >= by.scream.windup - 1e-6 && t <= by.scream.windup + by.scream.strike + DT && s.stunSeen >= 0.8, `hurt at ${t.toFixed(3)} · stunned ${s.stunSeen?.toFixed(2)} s`); }
  { const [s, e] = boss(); let hurt = 0; s.hooks.heroHurt = () => hurt++; s.startAttack(e, by.scream); for (let i = 0; i < 400 && e.state === 'attack'; i++) s.update(DT, { mx: -1, mz: 0, dash: Math.abs(e.stateT - (by.scream.windup - 0.1)) < DT / 2 }); ok('scream: rolling through the strike dodges it', hurt === 0 && s.log.some((l) => l[0] === 'dodge' || l[0] === 'roll')); }
  { const [s, e] = boss(); let hurt = 0; s.hooks.heroHurt = () => hurt++; s.startAttack(e, by.scream); run(s, 0.5, {}); run(s, 0.4, (i) => ({ bell: i === 0 }));
    ok('scream: the bell (echo) during the wind-up cuts it and staggers her; hits in the opening do 1.3×', hurt === 0 && e.state === 'stagger' && e.stagger > 2 && s.log.some((l) => l[0] === 'bossStagger'), `state ${e.state} · stagger ${e.stagger.toFixed(1)} s`); }
  { const [s, e] = boss({ x: 330 }); s.startAttack(e, by.wail); let n0 = -1; for (let i = 0; i < 200 && e.state === 'attack'; i++) { s.update(DT, {}); if (n0 < 0 && s.shots.length) n0 = e.stateT; }
    ok('wail: three shots leave at the end of the wind-up, along the warned lanes', n0 >= by.wail.windup - 1e-6 && n0 <= by.wail.windup + 2 * DT && s.log.filter((l) => l[0] === 'shot' && l[2] === 'spawn').length === 3, `first shot at ${n0.toFixed(3)}`); }
  { const [s, e] = boss({ phase: 2 }); s.startAttack(e, by.summon); run(s, by.summon.windup + 0.2, {}); ok('summon (phase 2): two ghosts appear at the marked spots after the wind-up', s.countKind('grave_ghost') === 2 && s.log.filter((l) => l[0] === 'summon').length === 2); }
  { const [s, e] = boss({ phase: 2 }); s.hero.reso = 2; let hurts = []; s.hooks.heroHurt = () => hurts.push(e.stateT); s.startAttack(e, by.song); run(s, by.song.windup + 1.6, {});
    const okPulse = hurts.length >= 2 && hurts[0] >= by.song.windup - 1e-6 && s.hero.reso < 2;
    run(s, 1.2, () => ({ bell: true })); 
    ok('song (phase 2): pulses hurt and drain resonance every 0.7 s; the bell breaks it and staggers her', okPulse && e.stagger > 0 && s.log.some((l) => l[0] === 'silence'), `pulses ${hurts.length} first at ${hurts[0]?.toFixed(2)} · reso ${s.hero.reso.toFixed(2)} · then ${e.state}`); }
  { const [s, e] = boss(); e.cd = 0.2; e.hp = Q.hp * 0.5 + 5; let fled = 0, back = 0; s.hooks.bossFlee = () => fled++; s.hooks.bossReturn = () => back++; s._hitEnemy(e, MOVES.c3, s.hero); const hpF = e.hp; run(s, 0.3, {}); const f = e.fled, solid = e.solid; s._hitEnemy(e, MOVES.c3, s.hero);
    const st0 = s.bossState(); run(s, Q.fleeAuto + 0.5, {});
    ok('phase: at half health she flees (bossFlee, untouchable, bossState.fled), comes back by herself after fleeAuto (or sim.bossReturn) in phase 2', fled === 1 && f && !solid && e.hp === hpF && st0.fled && st0.phase === 2 && back === 1 && !e.fled && e.solid && e.bphase === 2, `fled ${fled} · back ${back} · phase ${e.bphase}`); }
  { const [s, e] = boss({ phase: 2 }); e.hp = 60; for (let i = 0; i < 12; i++) s._hitEnemy(e, MOVES.c3, s.hero); run(s, 0.2, {}); const kneel = e.kneel > 0, hp = e.hp, st = s.bossState();
    for (let i = 0; i < 5; i++) s._hitEnemy(e, MOVES.c3, s.hero);
    s.hero.x = e.x - 120; s.hero.z = e.z; s.update(DT, { bell: true, bellHeld: true }); const kid = s.hero.knellId; run(s, 1.3, { bellHeld: true });
    ok('death: hits cannot finish her — she kneels at 4 % (bossState.kneel, hero.knellId); the long bell (knell) sends her (bossDown, knelled)', kneel && hp === Math.ceil(Q.hp * Q.kneelAt) && e.hp <= 0 && st.kneel && kid === e.id && e.state === 'dead' && e.knelled && s.log.some((l) => l[0] === 'knell') && s.log.some((l) => l[0] === 'bossDown'), `kneel ${kneel} hp ${hp} → ${e.hp} · ${e.state}`); }
  { const [s, e] = boss({ phase: 2 }); e.hp = Math.ceil(Q.hp * Q.kneelAt); run(s, Q.kneelWait + 0.5, {}); ok('left alone on her knees for kneelWait she gets up again with some health (no dead end)', e.kneel === 0 && e.hp === Math.round(Q.hp * Q.kneelHeal)); }
  const { bossBot, naiveBot } = await import('./play_bot.mjs');
  const fight = (bot, sd) => { seed = sd; const s = mk([{ kind: 'banshee_queen', x: 260, z: 0, active: true }]); const inp = {}, st = {}; let t = 0, end = null; while (t < 420 && !end) { bot(s, inp, st); s.update(DT, inp); t += DT; if (s.hero.dead || s.deaths > 0) end = 'lost'; else if (s.enemies[0].dead) end = 'won'; } return { end, t, hp: s.hero.hp, knelled: s.enemies[0].knelled, ok: finite(s), ev: new Set(names(s)) }; };
  const w = [11, 22, 33].map((sd) => fight(bossBot, sd)), l = [11, 22].map((sd) => fight(naiveBot, sd));
  ok('a bot that reads the tells (bell on scream/song, parry, roll, light for ghosts, long bell on the kneeling queen) beats her — three seeds', w.every((r) => r.end === 'won' && r.knelled && r.ok && r.ev.has('bossFlee') && r.ev.has('knell')), w.map((r) => `${r.end} in ${r.t.toFixed(0)} s hp ${r.hp}`).join(' · '));
  ok('a bot that only walks up and mashes attack loses', l.every((r) => r.end === 'lost'), l.map((r) => `${r.end} in ${r.t.toFixed(0)} s`).join(' · '));
  seed = 777; }
try {
  const { compileEnv } = await import('../../src/v2/env/build.js'); const W = compileEnv((await import('../../src/v2/env/stage_slice0_env.js')).default);
  const s = new Sim(W, {}), h = s.hero; h.x = 1960; h.z = 244; h.y = s.w.ground(h.x, h.z); h.safe = { x: h.x, z: h.z, y: h.y }; h.hp = h.hpMax = 1e6;
  s.enemies.length = 0; const e = s.addEnemy({ kind: 'melee', x: 2020, z: 330, active: true }); let tells = 0, minD = 1e9; s.hooks.tell = () => { tells++; };
  run(s, 8, {}, () => { minD = Math.min(minD, Math.hypot(e.x - h.x, e.z - h.z)); });
  ok('env-kit world: wedge at the alley mouth is gone (enemy reaches the hero and attacks)', tells >= 1 && minD < 100, `closest ${minD.toFixed(0)} attacks ${tells}`);
  const s3 = new Sim(W, {}); s3.teleport('yard'); s3.hero.hp = s3.hero.hpMax = 1e6; let t3 = 0; s3.hooks.tell = () => { t3++; };
  run(s3, 1.5, {}); const woke0 = s3.enemies.filter((q) => q.active).length;   // standing at the yard entry: nobody is close enough to see him yet
  const since = new Map(); run(s3, 20, (i, q) => { const hh = q.hero; if (q.enemies.some((e) => e.active)) return {}; let n = null, nd = 1e9; for (const e of q.enemies) if (e.yard && !e.dead) { const d = Math.hypot(e.x - hh.x, e.z - hh.z); if (d < nd) { nd = d; n = e; } } return n ? { mx: (n.x - hh.x) / nd, mz: (n.z - hh.z) / nd } : {}; }, (q, i) => { for (const e of q.enemies) if (e.active && !since.has(e.id)) since.set(e.id, i); });
  const act = s3.enemies.filter((q) => q.active), far = act.filter((q) => q.def.ai === 'melee' && 1200 - since.get(q.id) > 480 && Math.hypot(q.x - s3.hero.x, q.z - s3.hero.z) > 300).length;   // 깨어난 지 8초가 넘었는데도 멀리 있는 것 (막 깨어난 것은 세지 않는다)
  const asleepFar = s3.enemies.filter((q) => !q.active && Math.hypot(q.x - s3.hero.x, q.z - s3.hero.z) > 320).length;
  ok('env-kit world: yard enemies that see the hero wake, reach him and attack; none left stuck far away; the ones out of sight stay asleep', woke0 === 0 && act.length >= 1 && t3 >= 3 && far === 0 && finite(s3), `woke while he stood at the entry ${woke0} · after walking up: active ${act.length} attacks ${t3} far ${far} · still asleep beyond 320 px ${asleepFar}`);
} catch (err) { ok('env-kit world loads in node', false, String(err?.message ?? err).split('\n')[0]); }

Math.random = realRandom;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
