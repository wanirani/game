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
  run(s, 0.4 * 78 / KINDS.ranged.speed, {}, (q) => { if (q.enemies[0].state === 'attack') casts++; s.hero.hp = 100; });
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
// ── 쉼터: 체력 채우기 · 쓰러지면 쉼터에서 일어난다 · 구역 따라가기 ──
{ const s = mk([{ kind: 'melee', x: 200, z: 0, active: true }, { kind: 'melee', x: 260, z: 60, active: true }]); const [a, b] = s.enemies; a.cd = b.cd = 99;
  s.hero.hp = 40; const got = s.heal(25), got2 = s.heal('full');
  ok('sim.heal(n | full) fills the hero (event heal)', got === 25 && got2 === 35 && s.hero.hp === s.hero.hpMax && s.log.some((l) => l[0] === 'heal'));
  s.respawnAt(-200, 40); s._kill(a); run(s, 1.5, {}); s.hero.hp = 1; s.hurtHero(50, -1, 0, { e: b }); run(s, TUNE.deadT + 0.3, {});
  ok('with a rest spot (sim.respawnAt) a dead hero stands up there with full health; the dead stay dead, the living go back to sleep at their posts', s.deaths === 1 && !s.hero.dead && s.hero.hp === s.hero.hpMax && Math.abs(s.hero.x + 200) < 30 && a.dead && !b.dead && !b.active && Math.abs(b.x - 260) < 1 && s.log.some((l) => l[0] === 'respawn'), `hero ${s.hero.x.toFixed(0)},${s.hero.z.toFixed(0)} hp ${s.hero.hp} · a dead ${a.dead} · b active ${b.active} at ${b.x.toFixed(0)}`);
  const s2 = mk([{ kind: 'melee', x: 200, z: 0, active: true }]); s2.hero.hp = 1; s2.hurtHero(50, -1, 0, {}); run(s2, TUNE.deadT + 0.3, {}); ok('without a rest spot the area restarts as before (sim.reset)', s2.deaths === 1 && s2.enemies.length === 1 && s2.enemies[0].hp === s2.enemies[0].hpMax && !s2.hero.dead);
  const s3 = mk([{ kind: 'melee', x: 100, z: 0, active: true, yard: true }]); s3._kill(s3.enemies[0]); run(s3, 2, {}); const frozen = s3.section; s3.freezeSection = false; run(s3, 0.1, {});
  ok("sim.section stops at 'done' after the yard is cleared (test route); sim.here always follows the hero; freezeSection = false lets section follow too", s3.done && frozen === 'done' && s3.here === 'arena' && s3.section === 'arena' && s3.caps.skill && s3.caps.bell, `section ${frozen} → ${s3.section} · here ${s3.here}`); }
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
  run(s3, 1.5, {}); const woke0 = s3.enemies.filter((q) => q.active).length;   // standing at the yard entry: nobody is close enough to see him yet - except a sleeper who happens to look his way (since 2026-11-18 sleepers face ±70° off the entry, each his own way)
  const since = new Map(); run(s3, 20, (i, q) => { const hh = q.hero; if (q.enemies.some((e) => e.active)) return {}; let n = null, nd = 1e9; for (const e of q.enemies) if (e.yard && !e.dead) { const d = Math.hypot(e.x - hh.x, e.z - hh.z); if (d < nd) { nd = d; n = e; } } return n ? { mx: (n.x - hh.x) / nd, mz: (n.z - hh.z) / nd } : {}; }, (q, i) => { for (const e of q.enemies) if (e.active && !since.has(e.id)) since.set(e.id, i); });
  const act = s3.enemies.filter((q) => q.active), far = act.filter((q) => q.def.ai === 'melee' && 1200 - since.get(q.id) > 480 && Math.hypot(q.x - s3.hero.x, q.z - s3.hero.z) > 300).length;   // 깨어난 지 8초가 넘었는데도 멀리 있는 것 (막 깨어난 것은 세지 않는다)
  const asleepFar = s3.enemies.filter((q) => !q.active && Math.hypot(q.x - s3.hero.x, q.z - s3.hero.z) > 320).length;
  ok('env-kit world: yard enemies that see the hero wake, reach him and attack; none left stuck far away; the ones out of sight stay asleep', woke0 <= 1 && act.length >= 1 && t3 >= 3 && far === 0 && finite(s3), `woke while he stood at the entry ${woke0} · after walking up: active ${act.length} attacks ${t3} far ${far} · still asleep beyond 320 px ${asleepFar}`);
} catch (err) { ok('env-kit world loads in node', false, String(err?.message ?? err).split('\n')[0]); }

// ── BREAK: breakables and pickups (src/v2/play/breakables.js — docs/v2/PLAY_API.md 13) ──
{
  const { BREAK_KINDS, DROP_TABLE, PICK, breakOne, spawnPickup } = await import(process.env.PLAY_ENTRY || '../../src/v2/play/index.js');
  const mkB = (brk, spawns = [], hooks = {}) => { const W = flatArena(520, 360, spawns); W.breakables = brk; const log = []; const sim = new Sim(W, { event: (n, ...a) => log.push([n, ...a]), ...hooks }); sim.log = log; sim.seedDrops(1234); return sim; };
  const breaks = (sim) => sim.log.filter((l) => l[0] === 'break').map((l) => l[1].kind + ':' + l[2]);
  ok('breakables: W.breakables -> records with a solid box each, a pickup pool', (() => { const s = mkB([{ kind: 'jar', x: 80, z: 0 }, { kind: 'crate', x: 0, z: 120 }, { kind: 'nope', x: 5, z: 5 }]); return s.breakables.length === 2 && s.brkLive === 2 && s.breakables.every((b) => b.box.solid && !b.box.walk && b.y === 0) && s.pickups.length === PICK.pool && s.hero.coins === 0; })());
  // every attack breaks (one hit), the event names the move
  { const s = mkB([{ kind: 'jar', x: 70, z: 0, drop: 'none' }]); run(s, 0.3, { attack: true }); ok('combo 1 breaks a jar in one hit (event break by c1)', breaks(s).join() === 'jar:c1' && !s.breakables[0].box.solid && s.brkLive === 0, breaks(s).join()); }
  { const s = mkB([{ kind: 'crate', x: 86, z: 0, drop: 'none' }, { kind: 'barrel', x: 150, z: 0, drop: 'none' }]); run(s, 1.6, (i) => ({ attack: i === 0 || i === 16 || i === 34 }));
    const mv = s.log.filter((l) => l[0] === 'attack').map((l) => l[2].id); ok('combo 1-2-3: the crate breaks on the first hit, the barrel behind it by a later step', mv.join('>') === 'c1>c2>c3' && breaks(s)[0] === 'crate:c1' && breaks(s).length === 2, mv.join('>') + ' · ' + breaks(s).join()); }
  { const s = mkB([{ kind: 'pot', x: 0, z: -100, drop: 'none' }, { kind: 'urn', x: 40, z: 100, drop: 'none' }]); run(s, 1.6, (i) => ({ attack: i === 0 || i === 16 || i === 34 })); ok('the third (wide) step breaks what stands beside and behind', breaks(s).filter((b) => b.endsWith(':c3')).length === 2, breaks(s).join()); }
  { const s = mkB([{ kind: 'jar', x: 230, z: 0, drop: 'none' }]); run(s, 0.14, { mx: 1, mz: 0 }); run(s, 0.02, { mx: 1, mz: 0, dash: true }); run(s, 0.8, (i) => ({ mx: 1, mz: 0, attack: i === 14 }));
    ok('the sweep after a roll breaks', breaks(s).join() === 'jar:sweep' || breaks(s).join() === 'jar:roll', breaks(s).join()); }
  { const s = mkB([{ kind: 'barrel', x: 215, z: 0, drop: 'none' }, { kind: 'jar', x: 150, z: 10, drop: 'none' }]); run(s, 1.2, (i) => ({ attack: i === 0, attackHeld: i < 62 })); ok('the charged whip breaks everything along its reach', breaks(s).includes('barrel:whip') && breaks(s).length === 2, breaks(s).join()); }
  { const s = mkB([{ kind: 'crate', x: 60, z: 0, drop: 'none' }, { kind: 'urn', x: -60, z: 40, drop: 'none' }]); run(s, 1.2, (i) => ({ jump: i === 0, jumpHeld: i < 12, attack: i === 14 })); ok('the plunge breaks (its blade or its landing ring)', breaks(s).length === 2 && breaks(s).every((b) => b.endsWith(':plunge')), breaks(s).join()); }
  { const s = mkB([{ kind: 'jar', x: 150, z: 0, drop: 'none' }]); ok('sim.breakAt(x, z, r): a skill that hurts in an area breaks what is whole in the circle', s.breakAt(120, 0, 40, 'area') === 1 && breaks(s).join() === 'jar:area' && s.breakAt(120, 0, 40) === 0); }
  // the roll: clay breaks and no speed is lost; wood stops the roll and stays whole
  { const free = mkB([]); run(free, 0.02, { mx: 1, mz: 0, dash: true }); run(free, 0.5, { mx: 0, mz: 0 }); const d0 = free.hero.x;
    const s = mkB([{ kind: 'jar', x: 60, z: 0, drop: 'none' }, { kind: 'pot', x: 104, z: 6, drop: 'none' }, { kind: 'urn', x: 140, z: -8, drop: 'none' }]); run(s, 0.02, { mx: 1, mz: 0, dash: true }); run(s, 0.5, { mx: 0, mz: 0 });
    ok('roll through a row of three clay things: all break (by roll) and the roll covers the same distance as on open ground', breaks(s).join() === 'jar:roll,pot:roll,urn:roll' && Math.abs(s.hero.x - d0) < 0.01, `open ${d0.toFixed(1)} · through jars ${s.hero.x.toFixed(1)} · ${breaks(s).join()}`); }
  for (const k of ['crate', 'barrel']) { const s = mkB([{ kind: k, x: 70, z: 0, drop: 'none' }]); run(s, 0.02, { mx: 1, mz: 0, dash: true }); run(s, 0.5, { mx: 0, mz: 0 }); const K = BREAK_KINDS[k];
    ok(`roll into a ${k}: it stays whole and stops the roll at its side`, breaks(s).length === 0 && !s.breakables[0].broken && s.hero.x <= 70 - K.r - s.hero.r + 0.01 && s.hero.x > 20, `hero x ${s.hero.x.toFixed(1)}`); }
  { const s = mkB([{ kind: 'jar', x: 60, z: 0, drop: 'none' }]); run(s, 1.0, { mx: 1, mz: 0 }); ok('walking or running into a jar does not break it (it is solid)', breaks(s).length === 0 && s.hero.x <= 60 - 17 - 14 + 0.01, `hero x ${s.hero.x.toFixed(1)}`); }
  // enemies never break them
  { const s = mkB([{ kind: 'jar', x: 40, z: 0, drop: 'none' }, { kind: 'pot', x: -44, z: 0, drop: 'none' }, { kind: 'crate', x: 0, z: 60, drop: 'none' }], [{ kind: 'melee', x: 95, z: 0, active: true }, { kind: 'gravekeeper_armor', x: 0, z: -110, active: true }, { kind: 'ranged', x: -300, z: 0, active: true }, { kind: 'bat', x: 100, z: 100, active: true }]);
    s.hero.hp = s.hero.hpMax = 1e6; let sw = 0, shots = 0; s.hooks.enemySwing = () => sw++; s.hooks.shot = (q, w) => { if (w === 'spawn') shots++; };
    run(s, 14, {}); ok('enemies swinging, slamming, shooting and diving beside jars and a crate for 14 s break nothing', sw >= 6 && shots >= 2 && breaks(s).length === 0 && s.brkLive === 3 && finite(s), `swings ${sw} shots ${shots}`); }
  // the drop table: shares over 10,000 seeded breaks per kind
  for (const k of Object.keys(DROP_TABLE)) {
    const s = mkB([{ kind: k, x: 200, z: 0 }]), b = s.breakables[0], T = DROP_TABLE[k], n = { none: 0, coin: 0, heal: 0, reso: 0 }; let cmin = 99, cmax = 0, csum = 0; s.seedDrops(20261118);
    s.hooks.drop = (what, cnt) => { n[what]++; if (what === 'coin') { cmin = Math.min(cmin, cnt); cmax = Math.max(cmax, cnt); csum += cnt; } };
    for (let i = 0; i < 10000; i++) { b.broken = false; s.brkLive = 1; breakOne(s, b, 'c1', 1, 0, false); for (const p of s.pickups) p.on = false; s.pickN = 0; }
    const sh = [n.none, n.coin, n.heal, n.reso].map((v) => v / 100), okS = sh.every((v, i) => Math.abs(v - T.share[i]) < 1.5);
    ok(`drop table ${k}: shares over 10,000 seeded breaks within 1.5 points of [${T.share.join(', ')}] %, coins ${T.coins[0]}-${T.coins[1]}`, okS && cmin === T.coins[0] && cmax === T.coins[1], `none ${sh[0].toFixed(1)} coin ${sh[1].toFixed(1)} heal ${sh[2].toFixed(1)} reso ${sh[3].toFixed(1)} · coins ${cmin}-${cmax} (mean ${(csum / n.coin).toFixed(2)})`); }
  { const seq = (seed) => { const s = mkB([{ kind: 'barrel', x: 200, z: 0 }]), b = s.breakables[0], out = []; s.seedDrops(seed); s.hooks.drop = (w, c) => out.push(w + c); for (let i = 0; i < 40; i++) { b.broken = false; s.brkLive = 1; breakOne(s, b, 'c1', 1, 0, false); } return out.join(','); };
    ok('the drop generator is seeded: the same seed gives the same drops, another seed gives others', seq(7) === seq(7) && seq(7) !== seq(8)); }
  { const s = mkB([{ kind: 'jar', x: 70, z: 0, drop: 'coin4' }, { kind: 'pot', x: 70, z: 60, drop: 'heal' }, { kind: 'urn', x: 70, z: -50, drop: 'reso' }]); s.breakAt(70, 0, 80); ok('a fixed drop of the area entry (coin4 / heal / reso) is what comes out', s.pickN === 6 && s.pickups.filter((p) => p.on && p.what === 0).length === 4 && s.pickups.filter((p) => p.on && p.what === 1).length === 1 && s.pickups.filter((p) => p.on && p.what === 2).length === 1); }
  // pickups: never under the floor, never inside a wall, never off the floor's edge
  { const spots = []; for (let i = 0; i < 60; i++) { const a = i * 0.7, edge = i % 3; spots.push({ kind: 'jar', x: edge === 0 ? 500 - (i % 5) * 2 : edge === 1 ? -500 + (i % 7) : Math.cos(a) * 300, z: edge === 0 ? Math.sin(a) * 320 : edge === 1 ? 340 - (i % 4) * 3 : -340 + (i % 6), drop: 'coin5' }); }
    const s = mkB(spots); s.hero.x = 0; s.hero.z = 0; let bad = 0, low = 0, seen = 0;
    for (let k = 0; k < 6; k++) { for (let j = k * 10; j < k * 10 + 10; j++) breakOne(s, s.breakables[j], 'c1', Math.cos(j * 2.4), Math.sin(j * 2.4), false);
      for (let t = 0; t < 150; t++) { s.update(DT, {}); for (const p of s.pickups) { if (!p.on) continue; seen++; if (!(p.y >= -0.001)) low++; if (!(Math.abs(p.x) <= 520 - PICK.r + 0.01 && Math.abs(p.z) <= 360 - PICK.r + 0.01) || !Number.isFinite(p.x + p.y + p.z)) bad++; } } }
    const rest = s.pickups.filter((p) => p.on && Math.hypot(p.x, p.z) > PICK.pullR + 30), settled = rest.every((p) => p.rest && p.y === 0);
    ok('300 coins thrown from jars along the walls and in the corners: none under the floor, none inside a wall, all come to rest on the floor', seen > 5000 && bad === 0 && low === 0 && settled, `samples ${seen} inside walls ${bad} under the floor ${low} at rest ${rest.length}`); }
  { const W = flatArena(520, 360); W.boxes[0] = { x0: -520, x1: 120, z0: -360, z1: 360, y0: -40, y1: 0, solid: false, walk: true };   // the floor ends at x 120: beyond it a pit
    W.breakables = [{ kind: 'barrel', x: 90, z: 0, drop: 'coin5' }, { kind: 'jar', x: 100, z: 80, drop: 'coin5' }]; const s = new Sim(W, {}); s.seedDrops(5); s.hero.x = -400; breakOne(s, s.breakables[0], 'c1', 1, 0, false); breakOne(s, s.breakables[1], 'c1', 1, 0.2, false);
    let off = 0; for (let t = 0; t < 200; t++) { s.update(DT, {}); for (const p of s.pickups) if (p.on && (p.x > 120.01 || p.y < -0.001)) off++; }
    ok('coins thrown toward a floor edge turn back: none leaves the floor', off === 0 && s.pickN === 10 && s.pickups.filter((p) => p.on).every((p) => p.rest)); }
  // picking up: coins count, heal and resonance never above the maximum, a piece the hero has no use for turns to silver (it is never refused)
  { const s = mkB([]); spawnPickup(s, 0, 60, 30, 0, 0, 200, 0, 0); spawnPickup(s, 0, 80, 30, 10, 0, 200, 0, 0); let ev = []; s.hooks.pickup = (w, n) => ev.push(w + n);
    run(s, 0.2, {}); const early = s.hero.coins; run(s, 1.5, {}); ok('coins near the hero are drawn to him and picked up on touch (not before they have popped), hero.coins counts', early === 0 && s.hero.coins === 2 && ev.join() === 'coin1,coin1' && s.pickN === 0, `coins ${s.hero.coins}`); }
  { const s = mkB([]); spawnPickup(s, 0, 300, 30, 0, 0, 200, 0, 0); run(s, 2, {}); const far = s.pickups.find((p) => p.on); ok('a coin 300 away stays where it fell until the hero comes', !!far && far.rest && Math.abs(far.x - 300) < 1 && s.hero.coins === 0); run(s, 1.2, { mx: 1, mz: 0 }); ok('... and is taken when he runs past', s.hero.coins === 1); }
  { const s = mkB([]); s.hero.hp = s.hero.hpMax - 5; spawnPickup(s, 1, 40, 30, 0, 0, 200, 0, 0); run(s, 1.5, {}); ok('heal: never above the maximum', s.hero.hp === s.hero.hpMax && s.pickN === 0, `hp ${s.hero.hp}`);
    const ev = []; s.hooks.pickup = (w, n) => ev.push(w + n); const c0 = s.hero.coins || 0;
    spawnPickup(s, 1, 30, 30, 0, 0, 200, 0, 0); run(s, 3, {}); ok('heal at full health: the piece is drawn in and taken all the same and turns to silver (+' + PICK.spare + ' coins, event pickup coin)', s.pickN === 0 && s.hero.hp === s.hero.hpMax && (s.hero.coins || 0) === c0 + PICK.spare && ev.join() === 'coin' + PICK.spare, `coins ${s.hero.coins} ev ${ev.join()} live ${s.pickN}`);
    s.hero.hp = 40; ev.length = 0; spawnPickup(s, 1, 30, 30, 0, 0, 200, 0, 0); run(s, 1.5, {}); ok('... and a hurt hero is healed by it (+' + PICK.heal + ', no silver)', s.pickN === 0 && s.hero.hp === 40 + PICK.heal && (s.hero.coins || 0) === c0 + PICK.spare && ev.join() === 'heal1', `hp ${s.hero.hp} ev ${ev.join()}`); }
  { const s = mkB([]); s.hero.reso = s.hero.resoMax - 0.1; spawnPickup(s, 2, 30, 30, 0, 0, 200, 0, 0); run(s, 1.5, {}); ok('resonance: never above the maximum', Math.abs(s.hero.reso - s.hero.resoMax) < 1e-9 && s.pickN === 0, `reso ${s.hero.reso}`);
    const c0 = s.hero.coins || 0; spawnPickup(s, 2, 30, 30, 0, 0, 200, 0, 0); run(s, 2, {}); ok('a mote at full resonance is taken too and turns to silver', s.pickN === 0 && (s.hero.coins || 0) === c0 + PICK.spare && Math.abs(s.hero.reso - s.hero.resoMax) < 1e-9, `coins ${s.hero.coins} live ${s.pickN}`); }
  { const s = mkB([]); spawnPickup(s, 0, 400, 30, 0, 0, 200, 0, 0); run(s, PICK.life - 0.5, {}); const on = s.pickN; run(s, 1, {}); ok(`a pickup vanishes after ${PICK.life} s`, on === 1 && s.pickN === 0); }
  { const s = mkB([{ kind: 'jar', x: 60, z: 0, drop: 'coin3' }]); run(s, 0.3, { attack: true }); const n1 = s.pickN; s.reset(); ok('sim.reset(): everything stands again, the pool is empty', n1 === 3 && s.brkLive === 1 && !s.breakables[0].broken && s.breakables[0].box.solid && s.pickN === 0); }
}

// ── 14. Input buffer (WHIP, 2026-11-19 — PLAY_API 1.1): a press is carried TUNE.bufT and fires on the first tick the hero may do it; the newest press wins; a press fires once ──
{
  const tick = (s, inp) => s.update(DT, inp || {}), N = Math.round(TUNE.bufT / DT) - 1;   // N = ticks after the press tick on which the press is still alive (10 at 60 Hz)
  const until = (s, cond, inp, max = 200) => { let i = 0; while (i < max && !cond(s)) { tick(s, typeof inp === 'function' ? inp(i) : inp); i++; } return i; };
  ok(`TUNE.bufT ${TUNE.bufT} s = the press tick + ${N} ticks`, N >= 9 && N <= 11);
  { // roll pressed inside the hit window of hit 1: used to be dropped, now rolls on the first tick after the window
    const s = mk(); const ev = []; s.hooks.roll = () => ev.push(s.hero.moveT); tick(s, { attack: true });
    const k0 = Math.ceil((MOVES.c1.hit[1] - TUNE.bufT) / DT) + 2; for (let i = 0; i < k0; i++) tick(s, { mx: 1 }); tick(s, { mx: 1, dash: true }); const before = s.hero.dashT > 0, at = s.hero.moveT;
    const n = until(s, (q) => q.hero.dashT > 0, { mx: 1 }, 30);
    ok('roll pressed inside the hit window of hit 1 is carried and rolls on the first free tick', !before && s.hero.dashT > 0 && n <= N && names(s).filter((x) => x === 'roll').length === 1, `pressed at move time ${at.toFixed(3)} (window ends ${MOVES.c1.hit[1]}), rolled ${n} ticks later`); }
  { // the same press made too early is not carried past bufT
    const s = mk(); tick(s, { attack: true }); tick(s, { mx: 1, dash: true }); run(s, 0.6, { mx: 1 });
    ok('a roll pressed more than bufT before the hero is free never fires', !names(s).includes('roll'), `roll events ${names(s).filter((x) => x === 'roll').length}`); }
  { // attack pressed late in hit 3: a new hit 1 starts on the very tick hit 3 ends
    const s = mk(); const ids = []; s.hooks.attack = (h, mv) => ids.push(mv.id + '@' + s._tick); let endT = -1;
    for (let i = 0; i < 90; i++) { tick(s, { attack: i % 9 === 0 && ids.length < 3 }); if (endT < 0 && ids.length === 3 && s.hero.move !== MOVES.c3) endT = s._tick; }   // the tick on which hit 3 ends when nothing more is pressed
    const s2 = mk(), ids2 = []; s2.hooks.attack = (h, mv) => ids2.push(mv.id + '@' + s2._tick);
    for (let i = 0; i < 90; i++) { const c3 = s2.hero.move === MOVES.c3, press = c3 && s2.hero.moveT >= MOVES.c3.dur - 0.12 && s2.hero.moveT < MOVES.c3.dur - 0.12 + DT; tick(s2, { attack: (i % 9 === 0 && ids2.length < 3) || press }); }
    ok('attack pressed 0.12 s before hit 3 ends: hit 1 starts on the tick hit 3 ends (it used to be dropped)', ids.length === 3 && ids2.length === 4 && ids2[3].startsWith('c1@') && Number(ids2[3].split('@')[1]) === endT, `without the late press ${ids.join(' ')} · with it ${ids2.join(' ')} · hit 3 ended on tick ${endT}`); }
  { // one press, one attack
    const s = mk(); let c = 0; s.hooks.attack = () => c++; tick(s, { attack: true }); run(s, 1.2, {});
    ok('a press fires once: one attack press = one attack', c === 1, `attacks ${c}`); }
  { // skill right after an attack began (a ring in reach): the hook is thrown when the hit window ends - no 'busy'
    const s = mk(); s.hookPoints.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] }); tick(s, {}); tick(s, { attack: true }); tick(s, {}); tick(s, { skill: true });
    const n = until(s, (q) => q.hero.act === 'hook', {}, 30), denied = s.log.some((l) => l[0] === 'deny');
    ok('skill pressed 2 ticks after an attack began: the hook is thrown on the first tick after the hit window, no "busy"', s.hero.act === 'hook' && !denied && n <= N, `thrown ${n} ticks after the press · deny ${denied}`); }
  { // attack + skill on the same tick: the stated priority (skill > roll > attack > jump)
    const s = mk(); s.hookPoints.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] }); tick(s, {}); let atk = 0; s.hooks.attack = () => atk++; tick(s, { attack: true, skill: true }); const act = s.hero.act; run(s, 1.2, {});
    ok('attack + skill on the same tick: the skill goes first (hook), the attack of that tick is dropped', act === 'hook' && atk === 0 && s.hero.onGround && !s.hero.act, `act ${act} · attacks ${atk}`); }
  { // roll + attack on the same tick: both used, as before (roll, then the sweep)
    const s = mk(); const ids = []; s.hooks.attack = (h, mv) => ids.push(mv.id); tick(s, { mx: 1, dash: true, attack: true }); run(s, 0.8, { mx: 1 });
    ok('roll + attack on the same tick: the roll, then the sweep (unchanged)', names(s).includes('roll') && ids.join() === 'sweep', ids.join()); }
  { // the newest press wins: an attack is being carried, then roll is pressed -> the roll fires and the older attack is forgotten
    const s = mk(); let atk = 0; s.hooks.attack = () => atk++; s.hurtHero(1, -1, 0, {}); s.stop = 0; const t0 = s.hero.hurtT;
    const kA = Math.round((t0 - 0.12) / DT), kD = kA + 3; let i = 0; while (s.hero.hurtT > 0 && i < 60) { tick(s, { mx: 1, attack: i === kA, dash: i === kD }); i++; }
    run(s, 0.6, { mx: 1 });
    ok('the newest press wins: attack then roll while stunned -> only the roll fires when the stun ends', names(s).filter((x) => x === 'roll').length === 1 && atk === 0, `rolls ${names(s).filter((x) => x === 'roll').length} · attacks ${atk}`); }
  { // presses while stunned: the last bufT of the stun is carried, earlier presses are not
    const a = mk(); a.hurtHero(1, -1, 0, {}); a.stop = 0; tick(a, { mx: 1, dash: true }); run(a, 0.8, { mx: 1 });
    const b = mk(); b.hurtHero(1, -1, 0, {}); b.stop = 0; const kb = Math.round((b.hero.hurtT - 0.1) / DT); let i = 0, free = -1, rolled = -1; for (; i < 60; i++) { tick(b, { mx: 1, dash: i === kb }); if (free < 0 && b.hero.hurtT <= 0) free = i; if (rolled < 0 && b.hero.dashT > 0) rolled = i; }
    ok('stunned: a roll pressed 0.1 s before the stun ends rolls on the first free tick; one pressed at its start does not', !names(a).includes('roll') && rolled >= 0 && rolled - free <= 1, `first free tick ${free}, rolled on tick ${rolled}`); }
  { // jump pressed in the roll's last ticks: jumps on the first tick after the roll
    const s = mk(); tick(s, { mx: 1, dash: true }); const k = Math.round(TUNE.rollT / DT) - 6; let jumped = -1, rollEnd = -1; for (let i = 0; i < 40; i++) { tick(s, { mx: 1, jump: i === k, jumpHeld: i >= k }); if (rollEnd < 0 && s.hero.dashT <= 0) rollEnd = i; if (jumped < 0 && !s.hero.onGround) jumped = i; }
    ok('jump pressed 0.1 s before the roll ends: jumps on the first tick after the roll', jumped >= 0 && jumped - rollEnd <= 1 && names(s).filter((x) => x === 'jump').length === 1, `roll ended on tick ${rollEnd}, off the ground on tick ${jumped}`); }
  { // a held attack (charging) no longer eats the skill press: the hook is thrown out of the charge
    const s = mk(); s.hookPoints.push({ id: 'r1', x: 250, y: 0, z: 40, to: [300, 50] }); let i = 0; for (; i < 60 && !s.hero.charging; i++) tick(s, { attack: i === 0, attackHeld: true });
    const was = s.hero.charging; tick(s, { attackHeld: true, skill: true });
    ok('skill while charging (attack held) with a ring in reach: the charge is let go and the hook is thrown', was && s.hero.act === 'hook' && !s.hero.charging && s.log.some((l) => l[0] === 'charge' && l[2] === 'cancel'), `charging ${was} -> act ${s.hero.act}`); }
  { // sim.dropPresses(): what the scene calls while it holds the hero
    const s = mk(); let atk = 0; s.hooks.attack = () => atk++; tick(s, { mx: 1, dash: true }); tick(s, { mx: 1, attack: true, jump: true }); s.dropPresses(); run(s, 0.8, {});
    ok('sim.dropPresses(): carried presses (attack queued behind a roll, a jump) never fire afterwards', atk === 0 && !names(s).includes('jump') && s.hero.queued === 0 && s.hero.bufJ === 0 && !s.hero.sweepQ, `attacks ${atk}`); }
  { // the roll against every enemy attack: started on any tick from 0.1 s before the first active tick up to that tick, in 8 directions and 3-5 distances, the hero is never hurt
    const CASES = [['skeleton_soldier', 'slash', [50, 70, 86]], ['skeleton_soldier', 'stab', [92, 120, 156]], ['plague_corpse', 'grab', [50, 80, 110, 150]], ['grave_ghost', 'swoop', [50, 80, 110, 140, 176]], ['gravekeeper_armor', 'slam', [60, 100, 132]], ['gravekeeper_armor', 'thrust', [136, 180, 226]], ['bat', 'dive', [60, 120, 180, 250]], ['banshee_queen', 'sweep', [80, 150, 205]], ['banshee_queen', 'scream', [80, 160, 240]]];
    const bad = []; let runs = 0;
    for (const [kind, id, dists] of CASES) {
      const atk = KINDS[kind].attacks.find((a) => a.id === id), w = Math.ceil(atk.windup / DT - 1e-6) - 1;
      for (let e = -6; e <= 0; e++) for (const dist of dists) for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4, s = new Sim(flatArena(900, 700, [{ kind, x: dist, z: 0, active: true }]), {}), en = s.enemies[0]; let got = false; s.hooks.heroHurt = () => { got = true; };
        en.dirX = -1; en.dirZ = 0; en.cd = 99; en.solid = true; s.update(DT, {}); s.startAttack(en, atk);
        for (let i = 0; i < w + Math.round((atk.strike + 0.5) / DT); i++) { s.update(DT, { mx: i >= w + e - 1 ? Math.cos(a) : 0, mz: i >= w + e - 1 ? Math.sin(a) : 0, dash: i === w + e }); if (en.state !== 'attack') break; }
        runs++; if (got) bad.push(`${kind}.${id} ${e} ticks, ${dist} px, ${k * 45} deg`);
      }
    }
    ok(`roll untouchable ${TUNE.rollIfr} s (roll ${TUNE.rollT} s): started 0.1 s before the first active tick or on it, no enemy attack lands (${runs} rolls: 9 attacks x 7 start ticks x 8 directions x 3-5 distances)`, bad.length === 0, bad.slice(0, 6).join(' | ')); }
}

Math.random = realRandom;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n  ' + fails.join('\n  ')); process.exit(1); }
