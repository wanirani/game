#!/usr/bin/env node
// 동료 데이터·세이브 상태·버스 연결 테스트 (CMP-DATA; companions §14 C1, MASTER_PLAN §1.2 · §1.6)
//   node tools/test_companion_state.mjs            전체
//   node tools/test_companion_state.mjs --verbose  통과한 항목도 출력
// 브라우저 없이 node 만으로 돈다 (data/companions.js, game/companion_state.js, game/companion_events.js 는 DOM 을 쓰지 않는다).
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERBOSE = process.argv.includes('--verbose');
const D = await import('../src/data/companions.js');
const S = await import('../src/game/companion_state.js');
const E = await import('../src/game/companion_events.js');
const { bus } = await import('../src/core/events.js');
const { newGameState, migrateState } = await import('../src/game/state.js');
const { STAT_KEYS, computeStats, addStats } = await import('../src/game/stats.js');
const { BOSSES } = await import('../src/data/bosses.js');

let pass = 0, fail = 0;
const fails = [];
function t(name, fn) {
  try { fn(); pass++; if (VERBOSE) console.log('  ok  ', name); }
  catch (e) { fail++; fails.push(name); console.log('  FAIL', name, '\n       ', e?.message ?? e); }
}
function eq(a, b, msg = '') {
  const ja = stable(a), jb = stable(b);
  if (ja !== jb) throw new Error(`${msg} 기대 ${jb} 실제 ${ja}`);
}
function ok(v, msg = '조건') { if (!v) throw new Error(msg); }
function near(a, b, eps = 1e-6, msg = '') { if (!(Math.abs(a - b) <= eps)) throw new Error(`${msg} 기대 ${b} 실제 ${a}`); }
function noThrow(fn, msg) { try { return fn(); } catch (e) { throw new Error(`${msg}: 예외 ${e?.stack ?? e}`); } }
/** 키 순서를 무시한 직렬화 (깊은 비교용) */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const fixture = (f) => JSON.parse(readFileSync(path.join(ROOT, 'tools/fixtures', f), 'utf8'));
/** 동료 기능 이전 모양의 세이브 (companions 필드 없음) */
function oldSave({ chapter = 0, bosses = [], relics = [], done = [], flags = {}, level = 10, charId = 'kael' } = {}) {
  const s = newGameState({ slot: 1, charId });
  delete s.companions;
  for (const h of Object.values(s.heroes)) { delete h.companions; h.level = level; }
  Object.assign(s.progress, { chapter, bosses: [...bosses], relics: [...relics], flags: { ...flags } });
  s.quests.done = [...done];
  return s;
}
/** 동료 기능이 있는 새 게임 (GAME-HOOKS 가 newGameState 에 ensureCompanionState 를 넣기 전에도 같은 결과) */
function freshState(opts = {}) { const s = oldSave(opts); S.migrateCompanions(s); return s; }
function listen(evt) { const got = []; const off = bus.on(evt, (d) => got.push(d)); return { got, off }; }
const HANGUL = /[가-힣]/;

// ══ 1. 로스터 (MASTER_PLAN §1.2) ═══════════════════════════════════════════════════════════
console.log('1. 로스터');
const MOUNT_TABLE = [
  // id, name, title, obtain(type:key), chapter, rig, portrait, cry
  ['mt_warhorse', '그림메인', '흑철 군마', 'flag:stable_open', 1, 'horse', 'portraits/cmp_m_warhorse', 'neigh'],
  ['mt_boar', '바르그', '철엄니 멧돼지', 'shop:6000', 2, 'boar', 'portraits/cmp_m_boar', 'boar_grunt'],
  ['mt_skelsteed', '코슈타', '망령 해골마', 'boss:b_dullahan', 3, 'horse', 'portraits/cmp_m_skelsteed', 'neigh'],
  ['mt_direwolf', '스콜', '서리 늑대', 'quest:cq_skoll', 4, 'wolf', 'portraits/cmp_m_direwolf', 'wolf_howl'],
  ['mt_wyvern', '스칼렛', '진홍 와이번', 'egg:b_chimera', 7, 'wyvern', 'portraits/cmp_m_wyvern', 'roar_small'],
  ['mt_giantbat', '녹티스', '거대 박쥐', 'relics:5', 11, 'bat', 'portraits/cmp_m_giantbat', 'screech'],
  ['mt_ignis', '이그니스', '화염 군마', 'flag:recruit_mt_ignis', 15, 'horse', 'portraits/cmp_mt_ignis', 'neigh'],
  ['mt_gale', '게일', '폭풍 그리핀', 'flag:recruit_mt_gale', 17, 'griffin', 'portraits/cmp_mt_gale', 'griffin_cry'],
  ['mt_silva', '실바', '백록 신령', 'flag:recruit_mt_silva', 19, 'stag', 'portraits/cmp_mt_silva', 'stag_call'],
];
const GUARD_TABLE = [
  ['gd_fairy', '아리아', '빛의 요정', 'boss:b_banshee', 2, 'portraits/cmp_g_fairy', 'fairy_chime'],
  ['gd_spiritwolf', '하티', '영혼 늑대', 'quest:cq_hati', 2, 'portraits/cmp_g_spiritwolf', 'wolf_howl'],
  ['gd_imp', '핌', '소악마 마법사', 'shop:7500', 3, 'portraits/cmp_g_imp', 'imp_cackle'],
  ['gd_knight', '가웨인', '망령 기사', 'boss:b_crimson', 4, 'portraits/cmp_g_knight', 'knight_guard'],
  ['gd_whelp', '크론', '새끼 본 드래곤', 'egg:b_bonedragon', 5, 'portraits/cmp_g_whelp', 'roar_small'],
  ['gd_owl', '미네르바', '성스러운 올빼미', 'boss:b_grimoire', 6, 'portraits/cmp_g_owl', 'owl_hoot'],
  ['gd_clock', '틱톡', '태엽 인형', 'boss:b_colossus', 9, 'portraits/cmp_g_clock', 'gear_whir'],
  ['gd_reaper', '모르스', '꼬마 사신', 'boss:b_death', 11, 'portraits/cmp_g_reaper', 'scythe'],
  ['gd_mirra', '미라', '거울 요정', 'flag:recruit_gd_mirra', 14, 'portraits/cmp_gd_mirra', 'mirror_chime'],
  ['gd_lumen', '루멘', '등불 해파리', 'flag:recruit_gd_lumen', 16, 'portraits/cmp_gd_lumen', 'jelly_zap'],
  ['gd_momo', '모모', '꿈먹는 맥', 'flag:recruit_gd_momo', 18, 'portraits/cmp_gd_momo', 'momo_gulp'],
];
const obtainKey = (o) => `${o.type}:${o.flag ?? o.boss ?? o.quest ?? o.price ?? o.count}`;
t('탈것 9 · 수호신 11 · 순서', () => {
  eq(D.MOUNT_IDS, MOUNT_TABLE.map((r) => r[0]));
  eq(D.GUARDIAN_IDS, GUARD_TABLE.map((r) => r[0]));
  eq(D.COMPANION_ORDER, [...D.MOUNT_IDS, ...D.GUARDIAN_IDS]);
  eq(D.UNLOCK_ORDER.length, 20);
  eq(new Set(D.UNLOCK_ORDER).size, 20);
});
for (const [id, name, title, ob, ch, rig, portrait, cry] of MOUNT_TABLE) {
  t(`탈것 ${id} ${name}`, () => {
    const d = D.MOUNTS[id];
    eq([d.id, d.kind, d.name, d.title, obtainKey(d.obtain), d.chapter, d.rig, d.portrait, d.cry.sfx], [id, 'mount', name, title, ob, ch, rig, portrait, cry]);
    ok(existsSync(path.join(ROOT, 'assets', d.portrait + '.webp')), '초상화 파일 없음 ' + d.portrait);
    ok(d.body.h <= 90 && d.body.w >= 56 && d.body.w <= 70, '몸 크기 ' + JSON.stringify(d.body));
    ok(d.seat.y < 0 && d.footY > 0, '안장점');
    ok(d.charge?.name && d.charge.desc && d.special?.name && d.special.desc && d.passive?.name && d.rideDesc, '능력 문구');
    ok(d.chips?.length === 3 && typeof d.join === 'string' && d.joinNarr === true, '합류 연출');
    for (const k of Object.keys(d.ride)) ok(STAT_KEYS.includes(k), '탑승 보너스 능력치 키 ' + k);
    ok(d.hp > 0 && d.absorb > 0 && d.absorb < 1 && d.taken > 0 && d.armor > 0 && d.recall > 0, 'HP 표');
  });
}
for (const [id, name, title, ob, ch, portrait, cry] of GUARD_TABLE) {
  t(`수호신 ${id} ${name}`, () => {
    const d = D.GUARDIANS[id];
    eq([d.id, d.kind, d.name, d.title, obtainKey(d.obtain), d.chapter, d.portrait, d.cry.sfx], [id, 'guardian', name, title, ob, ch, portrait, cry]);
    ok(existsSync(path.join(ROOT, 'assets', d.portrait + '.webp')), '초상화 파일 없음 ' + d.portrait);
    ok(d.attack?.name && d.attack.desc && d.attack.interval > 0 && d.attack.range > 0 && d.attack.mv > 0, '자동 공격');
    ok(d.skill?.name && d.skill.desc && d.skill.cd > 0 && d.skill.line, '스킬');
    ok(d.assist?.name && d.assist.desc && d.assist.mv > 0, '협공');
    ok(d.anchor && Number.isFinite(d.anchor.dx) && d.size?.w > 0 && d.speed > 0 && d.engage > 0 && d.light?.r > 0, '이동·빛');
    ok(d.chips?.length === 3 && typeof d.join === 'string', '합류 연출');
    for (const k of new Set([...Object.keys(d.aura.base), ...Object.keys(d.aura.perLv)])) ok(STAT_KEYS.includes(k), '오라 능력치 키 ' + k);
  });
}
t('초상화 크롭(iconFocus)·색·팔레트', () => {
  for (const id of D.COMPANION_ORDER) {
    const d = D.companionDef(id), f = d.iconFocus;
    ok(f && f.x > 0 && f.x < 1 && f.y > 0 && f.y < 1 && f.s > 0.1 && f.s <= 1, id + ' iconFocus');
    ok(/^#[0-9a-f]{6}$/i.test(d.color) && Array.isArray(d.palette) && d.palette.length >= 3, id + ' 색');
  }
});
t('울음소리 배율·보조음 (§1.2)', () => {
  eq(D.MOUNTS.mt_skelsteed.cry, { sfx: 'neigh', pitch: 0.8, extra: 'bone_rattle' });
  eq(D.MOUNTS.mt_ignis.cry, { sfx: 'neigh', pitch: 0.9, extra: 'fire' });
  eq(D.GUARDIANS.gd_spiritwolf.cry, { sfx: 'wolf_howl', pitch: 1.3 });
  eq(D.GUARDIANS.gd_whelp.cry, { sfx: 'roar_small', pitch: 1.6, extra: 'bone_rattle' });
});
t('울음·발굽 효과음 이름이 MASTER_PLAN §1.9 등록부에 있다', () => {
  const REG = new Set(('neigh gallop hoof_land boar_grunt wolf_howl wolf_bite wing_flap roar_small fire_breath screech bone_rattle fairy_chime knight_guard imp_cackle owl_hoot '
    + 'gear_whir scythe soul_reap stag_call griffin_cry mirror_chime jelly_zap momo_gulp fire footstep').split(' '));
  for (const id of D.COMPANION_ORDER) {
    const d = D.companionDef(id);
    ok(REG.has(d.cry.sfx) && (!d.cry.extra || REG.has(d.cry.extra)), id + ' 울음 ' + JSON.stringify(d.cry));
    if (d.hoof) ok(REG.has(d.hoof.sfx), id + ' 발굽 ' + d.hoof.sfx);
  }
});
t('보스 id 가 실제 보스 데이터에 있다', () => {
  for (const id of D.COMPANION_ORDER) { const o = D.companionDef(id).obtain; if (o.boss) ok(BOSSES[o.boss], id + ' → ' + o.boss); }
});
t('알 · 상점 · 의뢰 표', () => {
  eq(D.MOUNTS.mt_wyvern.obtain.hatchAfter, 2); eq(D.GUARDIANS.gd_whelp.obtain.egg, '본 드래곤의 알');
  eq(D.STABLE_SHOP.map((r) => [r.id, r.price, r.chapter]), [['mt_boar', 6000, 2], ['gd_imp', 7500, 3]]);
  eq(D.COMPANION_QUESTS, { cq_hati: 'gd_spiritwolf', cq_skoll: 'mt_direwolf' });
  eq(D.GUARDIANS.gd_imp.obtain.item, '소악마 계약서');
});
t('1부 탈것 이동 수치 (§3.4)', () => {
  const row = (id) => { const m = D.MOUNTS[id]; return [m.body.w, m.body.h, m.seat.x, m.seat.y, m.footY, m.move.speed, m.move.accel, m.move.decel, m.move.airAccel, m.move.jump, m.move.airJumps]; };
  eq(row('mt_warhorse'), [60, 90, -4, -56, 26, 400, 1500, 2000, 1200, 820, 0]);
  eq(row('mt_boar'), [64, 80, -6, -48, 20, 350, 2600, 2600, 1100, 700, 0]);
  eq(row('mt_skelsteed'), [58, 88, -4, -54, 26, 420, 2000, 2200, 1300, 800, 1]);
  eq(row('mt_direwolf'), [56, 78, -2, -44, 16, 480, 3400, 3000, 2000, 880, 1]);
  eq(row('mt_wyvern'), [66, 90, -10, -58, 24, 330, 2000, 2000, 1600, 760, 0]);
  eq(row('mt_giantbat'), [70, 84, -4, -52, 22, 300, 1800, 2000, 2600, 700, 0]);
  eq(D.MOUNTS.mt_direwolf.move.wallJump, true);
  eq(D.MOUNTS.mt_wyvern.flight, { type: 'glide', flaps: 3, flapVy: -620, glideFall: 150, glideSpeed: 400 });
  eq(D.MOUNTS.mt_giantbat.flight.type, 'fly'); eq(D.MOUNTS.mt_giantbat.flight.stamina, 3.0);
});
t('1부 탈것 체력 표 (§3.9)', () => {
  const row = (id) => { const m = D.MOUNTS[id]; return [m.hp, m.absorb, m.taken, m.armor, m.recall]; };
  eq(row('mt_warhorse'), [0.9, 0.7, 1, 0.1, 20]); eq(row('mt_boar'), [1.3, 0.8, 0.85, 0.16, 16]);
  eq(row('mt_skelsteed'), [0.8, 0.7, 1, 0.1, 18]); eq(row('mt_direwolf'), [0.7, 0.6, 1.1, 0.06, 14]);
  eq(row('mt_wyvern'), [1, 0.7, 1, 0.12, 22]); eq(row('mt_giantbat'), [0.75, 0.6, 1.15, 0.06, 24]);
  eq(D.MOUNTS.mt_skelsteed.hazard, { spike: 0, lava: 0.5, poison: 0, blood: 0 });
  eq(D.MOUNTS.mt_boar.hazard.spike, 0.5); eq(D.MOUNTS.mt_wyvern.hazard.lava, 0);
});
t('2부 탈것 기본 수치 (MASTER_PLAN §1.2)', () => {
  const m = D.MOUNTS;
  const row = (id) => [m[id].body.w, m[id].body.h, m[id].seat.x, m[id].seat.y, m[id].footY, m[id].move.speed, m[id].move.accel, m[id].move.decel, m[id].move.airAccel, m[id].move.jump, m[id].move.airJumps,
    m[id].hp, m[id].absorb, m[id].taken, m[id].armor, m[id].recall];
  eq(row('mt_ignis'), [60, 90, -4, -56, 26, 430, 1700, 2100, 1300, 820, 0, 0.95, 0.7, 1, 0.12, 18]);
  eq(row('mt_gale'), [64, 86, -6, -54, 22, 400, 2200, 2200, 2000, 840, 1, 0.8, 0.65, 1.05, 0.08, 20]);
  eq(row('mt_silva'), [58, 88, -4, -54, 24, 440, 2000, 2200, 1500, 900, 1, 0.85, 0.65, 1, 0.1, 16]);
  eq(m.mt_gale.move.airSpeed, 440);
  eq(m.mt_gale.flight, { type: 'glide', flaps: 2, flapVy: -600, glideFall: 140, glideSpeed: 440 });
  const c = m.mt_ignis.charge; eq([c.name, c.dur, c.speed, c.mv, c.element, c.kb, c.launch, c.cd, c.iframes, c.trail], ['화염 돌진', 0.38, 820, 1.3, 'fire', [440, -280], true, 0.8, 0.2, { life: 1, mv: 0.3, element: 'fire', rehit: 0.25 }]);
  const g = m.mt_gale.charge; eq([g.name, g.dur, g.speed, g.mv, g.element, g.stun, g.cd, g.iframes, g.dir8], ['질풍 돌격', 0.3, 880, 1.1, 'thunder', 0.3, 0.8, 0.2, true]);
  const s = m.mt_silva.charge; eq([s.name, s.dur, s.speed, s.mv, s.element, s.stun, s.kb, s.cd, s.iframes], ['뿔 돌격', 0.32, 840, 1.2, 'holy', 0.6, [360, -320], 0.7, 0.2]);
  eq([m.mt_ignis.special.name, m.mt_ignis.special.cd, m.mt_ignis.special.pillars.at, m.mt_ignis.special.pillars.w, m.mt_ignis.special.pillars.h, m.mt_ignis.special.pillars.mv], ['업화 발굽', 5, [70, 140, 210], 44, 150, 0.9]);
  eq([m.mt_gale.special.name, m.mt_gale.special.cd, m.mt_gale.special.leapVy, m.mt_gale.special.shock, m.mt_gale.special.columns.at, m.mt_gale.special.columns.mv], ['뇌명 급강하', 6, -700, { r: 140, mv: 1.3 }, [120, 240], 0.8]);
  eq([m.mt_silva.special.name, m.mt_silva.special.cd, m.mt_silva.special.r, m.mt_silva.special.mv, m.mt_silva.special.stun, m.mt_silva.special.cleanse, m.mt_silva.special.heal], ['정화의 울음', 8, 240, 0.9, 0.8, 40, 0.05]);
  eq([m.mt_ignis.ride, m.mt_gale.ride, m.mt_silva.ride], [{ fire: 20, resFire: 20 }, { thunder: 15, jumpPow: 8 }, { holy: 15, hpRegen: 1 }]);
  eq([m.mt_gale.windMul, m.mt_silva.blightMul, m.mt_ignis.hazard.lava, m.mt_silva.hazard.poison, m.mt_warhorse.windMul, m.mt_warhorse.blightMul], [0.5, 0.5, 0.5, 0, 1, 1]);
});
t('1부 수호신 수치 (§4.9)', () => {
  const g = D.GUARDIANS;
  const row = (id) => [g[id].move, g[id].size.w, g[id].size.h, g[id].front, g[id].anchor.dx, g[id].anchor.dy, g[id].attack.mv, g[id].attack.interval, g[id].attack.range, g[id].skill.cd];
  eq(row('gd_fairy'), ['fly', 16, 20, true, 34, -96, 0.5, 1.4, 320, 35]);
  eq(row('gd_spiritwolf'), ['ground', 50, 36, false, 60, 0, 0.7, 1.0, 380, 26]);
  eq(row('gd_imp'), ['fly', 26, 28, false, 40, -110, 0.8, 1.2, 360, 28]);
  eq(row('gd_knight'), ['ground', 34, 72, false, 46, 0, 0.9, 1.3, 300, 30]);
  eq(row('gd_whelp'), ['fly', 36, 30, false, 44, -100, 0.22, 1.8, 200, 32]);
  eq(row('gd_owl'), ['fly', 24, 24, true, 30, -120, 1.0, 1.6, 360, 30]);
  eq(row('gd_clock'), ['fly', 26, 32, false, 38, -104, 0.45, 1.5, 400, 45]);
  eq(row('gd_reaper'), ['float', 28, 40, false, 42, -60, 1.1, 1.5, 340, 40]);
  eq([g.gd_spiritwolf.bias, g.gd_reaper.bias, g.gd_knight.hover], ['behind', 'lowhp', true]);
  eq(g.gd_fairy.aura, { base: { hpRegen: 0.8, resHoly: 10 }, perLv: { hpRegen: 0.04 } });
  eq(g.gd_owl.aura, { base: { luck: 8, dropBonus: 10 }, perLv: { luck: 0.2, dropBonus: 0.2 } });
  eq(g.gd_reaper.passive.below, 0.12); eq(g.gd_reaper.assist.execute, 0.2);
  eq([g.gd_clock.skill.time, g.gd_clock.skill.timePerLv, g.gd_clock.skill.timeMax], [2.0, 0.02, 2.6]);
  eq(g.gd_fairy.light, { color: '#fff2b0', r: 110, i: 0.7 });
});
t('2부 수호신 기본 수치 (MASTER_PLAN §1.2)', () => {
  const g = D.GUARDIANS;
  const row = (id) => [g[id].move, g[id].size.w, g[id].size.h, g[id].front, g[id].anchor.dx, g[id].anchor.dy, g[id].attack.name, g[id].attack.mv, g[id].attack.element, g[id].attack.interval, g[id].attack.range,
    g[id].skill.name, g[id].skill.cd, g[id].assist.name, g[id].assist.mv, g[id].aura, g[id].light];
  eq(row('gd_mirra'), ['fly', 20, 30, true, 32, -100, '거울 파편', 0.55, 'ice', 1.3, 320, '만화경 난반사', 30, '반사 일격', 1.0,
    { base: { crit: 4, resIce: 10 }, perLv: { crit: 0.1 } }, { color: '#dff4ff', r: 90, i: 0.5 }]);
  eq(row('gd_lumen'), ['fly', 24, 28, true, 36, -104, '전기 촉수', 0.5, 'thunder', 1.4, 280, '심해의 등불', 32, '방전', 0.9,
    { base: { mpRegen: 1, resThunder: 10 }, perLv: { mpRegen: 0.03 } }, { color: '#6fe8ff', r: 120, i: 0.6 }]);
  eq(row('gd_momo'), ['float', 30, 24, false, 44, -70, '꿈 삼키기', 0.8, 'dark', 1.3, 300, '악몽 포식', 36, '코 휘두르기', 1.0,
    { base: { hpRegen: 0.5, resDark: 10 }, perLv: { hpRegen: 0.03 } }, { color: '#c060ff', r: 70, i: 0.4 }]);
  eq([g.gd_mirra.skill.count, g.gd_mirra.skill.mv, g.gd_mirra.passive.every, g.gd_mirra.passive.r], [8, 0.9, 5, 80]);
  eq([g.gd_lumen.skill.stun, g.gd_lumen.skill.mv, g.gd_lumen.skill.air, g.gd_lumen.passive.lightR, g.gd_lumen.passive.airDrainMul, g.gd_lumen.attack.chainMul], [1.5, 1.2, 100, 220, 0.5, 0.7]);
  eq([g.gd_momo.skill.pull, g.gd_momo.skill.pullT, g.gd_momo.skill.heal, g.gd_momo.passive.every, g.gd_momo.passive.r, g.gd_momo.passive.text], [200, 1.0, 0.1, 6, 120, '꺼억']);
  eq(g.gd_mirra.skill.line, '거울아, 거울아 — 저 괴물의 진짜 얼굴을 보여 줘!');
  eq(g.gd_mirra.join, '이제부터 당신의 뒤를 비출게요. 뒤에서 오는 건 제가 먼저 볼게요.');
  eq(g.gd_lumen.join, '빛나는 해파리가 등불 곁에 둥실 떠올랐다. 이제 어둠 속에서도 길을 밝혀 줄 것이다.');
  eq(g.gd_momo.join, '꿈먹는 맥이 당신의 그림자 속으로 쏙 들어왔다. 악몽은 이제 이 녀석의 간식이다.');
});
t('원문 대사·이름 변경 (§4.9 표, 이름 변경표)', () => {
  eq(D.GUARDIANS.gd_fairy.skill.line, '빛이여, 이 사람을 지켜 줘!');
  eq(D.GUARDIANS.gd_reaper.join, '스승님은 쓰러졌어. 이제 장부는 내가 들고 다닐게. …너, 오래 살 것 같진 않은데. 재밌겠다.');
  eq(D.MOUNTS.mt_wyvern.join, '연구소의 알에서 태어난 진홍의 비룡. 태어나 처음 본 당신을 어미로 여긴다.');
  eq(D.MOUNTS.mt_warhorse.join, '불타는 마구간에서 끝까지 버틴 검은 군마. 그 눈에는 아직 꺼지지 않은 불씨가 일렁인다.');
  ok(!JSON.stringify(D.MOUNTS).includes('루미') && !JSON.stringify(D.GUARDIANS).includes('루미'), '옛 이름 루미 가 남아 있다');
  ok(!JSON.stringify(D.MOUNTS.mt_wyvern).includes('이그니스'), '와이번에 옛 이름 이그니스');
  eq(D.STABLE_LINES.poor, ['금화가 모자라. 짐승도 영혼도 공짜로는 안 움직여.']);
});
t('플레이어가 보는 문구는 모두 한국어', () => {
  const texts = [];
  for (const id of D.COMPANION_ORDER) {
    const d = D.companionDef(id);
    texts.push(d.name, d.title, d.role, d.desc, d.join, d.obtain.hint, ...d.chips);
    for (const k of ['charge', 'special', 'attack', 'skill', 'assist', 'passive']) if (d[k]) texts.push(d[k].name, d[k].desc);
    if (d.rideDesc) texts.push(d.rideDesc);
    if (d.skill?.line) texts.push(d.skill.line);
  }
  texts.push(...Object.values(D.CMP_TEXT).filter((s) => s !== D.CMP_TEXT.levelUp), ...Object.values(D.STABLE_LINES).flat(), ...D.BOND_NAMES, ...D.BOND_PERKS.slice(1));
  for (const s of texts) ok(typeof s === 'string' && HANGUL.test(s), '한국어가 아닌 문구: ' + JSON.stringify(s));
  for (const s of texts) ok(!/\b(TODO|undefined|null|NaN)\b/.test(s), '잘못된 문구: ' + s);
});
t('문구 틀 cmpText (받침 조사)', () => {
  eq(D.cmpText('knocked', { name: '그림메인', n: 18 }), '그림메인이 쓰러졌다! (재소환 18초)');
  eq(D.cmpText('recalling', { name: '스콜', n: 12 }), '스콜이 아직 돌아오지 않았다 (12초)');
  eq(D.cmpText('recalling', { name: '코슈타', n: 3 }), '코슈타가 아직 돌아오지 않았다 (3초)');
  eq(D.cmpText('bond', { name: '아리아', rank: '공명' }), '「아리아」와의 유대가 깊어졌다 — 공명');
  eq(D.cmpText('bond', { name: '가웨인', rank: '신뢰' }), '「가웨인」과의 유대가 깊어졌다 — 신뢰');
  eq(D.cmpText('egg', { egg: '본 드래곤의 알' }), '「본 드래곤의 알」을 손에 넣었다 — 영혼의 마구간에 맡기자');
  eq(D.cmpText('joined', { name: '코슈타' }), '새 동료 합류 — 「코슈타」! 마을로 돌아가면 만날 수 있다');
  eq(D.cmpText('equipped', { name: '그림메인' }), '그림메인을 장착했다');
  eq(D.cmpText('equipped', { name: '미라' }), '미라를 장착했다');
  eq(D.cmpText('rideFirst', { name: '그림메인' }), '그림메인에 올라탔다!');
  eq(D.cmpText('없는 키 {x}을(를)', { x: '핌' }), '없는 키 핌을');
});
t('옛 id 정규화 · 안전한 조회', () => {
  eq(D.normCompanionId('m_warhorse'), 'mt_warhorse'); eq(D.normCompanionId('g_fairy'), 'gd_fairy');
  eq(D.companionDef('g_owl')?.id, 'gd_owl');
  for (const bad of ['__proto__', 'constructor', 'toString', '', null, undefined, 5, {}, 'mt_nope']) { eq(D.companionDef(bad), null, String(bad)); eq(D.normCompanionId(bad), null); }
  eq([D.companionKind('mt_gale'), D.companionKind('gd_momo'), D.companionKind('x')], ['mount', 'guardian', null]);
});

// ══ 2. 공식 (§9 표) ═══════════════════════════════════════════════════════════════════════
console.log('2. 공식');
t('§9 성장표 그대로', () => {
  const T = [[1, 0.300, 0.80, 1.00, 1.000, 1.00, 80], [5, 0.360, 0.88, 1.08, 1.020, 0.96, 725], [10, 0.435, 0.98, 1.18, 1.045, 0.91, 1992],
    [15, 0.510, 1.08, 1.28, 1.070, 0.86, 3646], [20, 0.585, 1.18, 1.38, 1.095, 0.81, 5627], [25, 0.660, 1.28, 1.48, 1.120, 0.76, 7898], [30, 0.735, 1.38, 1.58, 1.145, 0.71, null]];
  for (const [lv, sh, tr, hp, sp, cd, xp] of T) {
    near(D.guardianShare(lv), sh, 1e-9, `share(${lv})`); near(D.trampleRatio(lv), tr, 1e-9, `trample(${lv})`);
    near(D.mountHpMul(lv), hp, 1e-9, `hp(${lv})`); near(D.mountSpeedMul(lv), sp, 1e-9, `speed(${lv})`); near(D.cdMul(lv), cd, 1e-9, `cd(${lv})`);
    if (xp != null) eq(D.cexpToNext(lv), xp, `exp(${lv})`);
  }
  eq(D.cexpToNext(29), 9907);
  let tot = 0; for (let l = 1; l < 30; l++) tot += D.cexpToNext(l);
  ok(tot > 118000 && tot < 121000, '총 경험치 ≈119k: ' + tot);
  eq([D.cexpToNext(0), D.cexpToNext(NaN), D.cexpToNext(99)], [80, 80, D.cexpToNext(30)]);
});
t('유대 단계 BOND_RANKS/NAMES', () => {
  eq(D.BOND_RANKS, [0, 15, 40, 80, 130, 200]);
  eq(D.BOND_NAMES.slice(1), ['신뢰', '교감', '공명', '각성', '영혼 결속']);
  eq([0, 14, 15, 39, 40, 79, 80, 129, 130, 199, 200, 999, -5, NaN].map(D.bondRank), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0, 0]);
  eq([D.bondNext(0), D.bondNext(15), D.bondNext(200)], [15, 40, null]);
  eq(D.CMP_MAX_LV, 30);
});

// ══ 3. 세이브 · 마이그레이션 (§8) ════════════════════════════════════════════════════════════
console.log('3. 세이브 · 마이그레이션');
t('새 게임: 빈 동료 상태 · 영웅 편성 · JSON 왕복', () => {
  const s = freshState();
  eq(s.companions, { v: 1, owned: {}, eggs: {}, pending: [], clears: 0, autoSkill: null, slot2Seen: false, last: { mount: null, guards: [null, null] } });
  eq(s.heroes.kael.companions, { mount: null, guards: [null, null] });
  eq(clone(s), s, 'JSON 왕복');
  eq(S.ensureCompanionState(s), s.companions);
  const t2 = oldSave(); eq(S.ensureCompanionState(t2)?.v, 1, 'ensureCompanionState 가 없는 구조를 만든다');
});
t('ch0 세이브: 해금 없음', () => {
  const s = oldSave({ chapter: 0 }); S.migrateCompanions(s);
  eq(S.ownedIds(s), []); eq(s.companions.pending, []); eq(S.eggStatus(s), []);
});
t('ch3 + b_dullahan → 코슈타 합류 대기', () => {
  const s = oldSave({ chapter: 3, bosses: ['b_nightwing', 'b_banshee', 'b_dullahan'], level: 12 });
  const ev = listen('companionUnlocked');
  S.migrateCompanions(s); ev.off();
  eq(S.ownedIds(s), ['mt_skelsteed', 'gd_fairy']);
  eq(s.companions.pending, ['gd_fairy', 'mt_skelsteed'], '합류 순서(챕터)대로 대기');
  eq(s.companions.owned.mt_skelsteed.src, 'migrate'); eq(s.companions.owned.mt_skelsteed.lv, 8, '따라잡기 레벨 round(12×0.7)');
  eq(s.heroes.kael.companions, { mount: 'mt_skelsteed', guards: ['gd_fairy', null] });
  eq(ev.got.length, 0, '불러오기 중에는 버스 이벤트 없음');
});
t('ch5 + b_bonedragon → 부화 가능한 크론의 알', () => {
  const s = oldSave({ chapter: 5, bosses: ['b_bonedragon'] }); S.migrateCompanions(s);
  eq(S.isOwned(s, 'gd_whelp'), false);
  eq(S.eggStatus(s).map((e) => [e.id, e.ready, e.left, e.egg]), [['gd_whelp', true, 0, '본 드래곤의 알']]);
});
t('유물 5개 → 녹티스, 4개면 아님', () => {
  const four = oldSave({ chapter: 9, relics: ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_4'] }); S.migrateCompanions(four);
  eq(S.isOwned(four, 'mt_giantbat'), false, '중복 유물은 한 번만 센다');
  const five = oldSave({ chapter: 11, relics: ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4', 'k_relic_5'] }); S.migrateCompanions(five);
  eq(S.ownedIds(five), ['mt_giantbat']); eq(five.companions.owned.mt_giantbat.src, 'migrate');
});
t('quests.done cq_hati → 하티, cq_skoll → 스콜', () => {
  const s = oldSave({ chapter: 4, done: ['cq_hati', 'cq_skoll'] }); S.migrateCompanions(s);
  eq(S.ownedIds(s), ['mt_direwolf', 'gd_spiritwolf']);
});
t('플래그: stable_open → 그림메인, recruit_<id> → 2부 동료 (그림메인은 플래그 없이는 소급 없음)', () => {
  const a = oldSave({ chapter: 13, bosses: [], flags: {} }); S.migrateCompanions(a); eq(S.isOwned(a, 'mt_warhorse'), false);
  const b = oldSave({ chapter: 16, flags: { stable_open: true, recruit_gd_mirra: true, recruit_mt_ignis: true, recruit_gd_lumen: 1 } }); S.migrateCompanions(b);
  eq(S.ownedIds(b), ['mt_warhorse', 'mt_ignis', 'gd_mirra', 'gd_lumen']);
  eq(b.companions.owned.gd_mirra.src, 'migrate');
});
t('픽스처 save_ch6_nocmp: 아리아·코슈타·가웨인·미네르바 + 크론의 알 (C10 시나리오 2)', () => {
  const s = fixture('save_ch6_nocmp.json');
  ok(!('companions' in s) && !('companions' in s.heroes.kael), '픽스처에 동료 필드가 없어야 한다');
  S.migrateCompanions(s);
  eq(S.ownedIds(s), ['mt_skelsteed', 'gd_fairy', 'gd_knight', 'gd_owl']);
  eq(s.companions.pending, ['gd_fairy', 'mt_skelsteed', 'gd_knight', 'gd_owl']);
  eq(S.eggStatus(s).map((e) => [e.id, e.ready]), [['gd_whelp', true]]);
  for (const id of S.ownedIds(s)) eq([s.companions.owned[id].lv, s.companions.owned[id].src, s.companions.owned[id].seen], [13, 'migrate', false], id);
  eq(s.heroes.kael.companions, { mount: 'mt_skelsteed', guards: ['gd_fairy', null] }, '현재 영웅 자동 장착 (6장: 수호신 1칸)');
  eq(s.heroes.sera.companions, { mount: null, guards: [null, null] }, '다른 영웅은 마이그레이션 당시의 last 복사');
  eq(s.companions.last, { mount: 'mt_skelsteed', guards: ['gd_fairy', null] });
  eq(S.guardianSlots(s), 1);
});
t('픽스처 + migrateState 순서 (GAME-HOOKS: 기존 보정 → migrateCompanions) 와 멱등', () => {
  const s = migrateState(fixture('save_ch6_nocmp.json'));
  S.migrateCompanions(s);
  const once = clone(s);
  migrateState(s); S.migrateCompanions(s);
  eq(s, once, '두 번째 실행 결과가 같다');
  eq(clone(s), s, 'JSON 왕복');
});
t('픽스처 save_v1 (1부 완료): 보스 6 · 알 2 · 녹티스, 수호신 2칸', () => {
  const s = fixture('save_v1.json'); S.migrateCompanions(s);
  eq(S.ownedIds(s), ['mt_skelsteed', 'mt_giantbat', 'gd_fairy', 'gd_knight', 'gd_owl', 'gd_clock', 'gd_reaper']);
  eq(S.eggStatus(s).map((e) => [e.id, e.ready]), [['mt_wyvern', true], ['gd_whelp', true]]);
  eq(S.guardianSlots(s), 2);
  eq(s.heroes[s.charId].companions, { mount: 'mt_skelsteed', guards: ['gd_fairy', 'gd_knight'] });
  eq(s.companions.owned.gd_fairy.lv, 25, '영웅 48레벨 → 시작 레벨 상한 25');
  const once = clone(s); S.migrateCompanions(s); eq(s, once, '멱등');
});
t('손상된 세이브를 견딘다 (§14 C1)', () => {
  for (const bad of [5, 'x', null, [], true, { v: 1 }, { v: 2, owned: 5 }, { owned: [], eggs: 'x', pending: 'y', last: 7 }]) {
    const s = oldSave({ chapter: 3 }); s.companions = clone(bad ?? null);
    noThrow(() => S.migrateCompanions(s), JSON.stringify(bad));
    eq([s.companions.v, typeof s.companions.owned, Array.isArray(s.companions.pending)], [1, 'object', true], JSON.stringify(bad));
  }
  const s = oldSave({ chapter: 3, bosses: ['b_banshee'] });
  s.companions = JSON.parse(`{"v":1,"owned":{"__proto__":{"lv":3},"m_boar":{"lv":"x","exp":-5,"bond":999,"src":"hack","gift":"a","seen":"yes"},
    "gd_imp":{"lv":99,"exp":1e9,"bond":-3},"gd_knight":7,"unknown_id":{"lv":2},"gd_owl":{"lv":4.7,"exp":12.9,"bond":40.2}},
    "eggs":{"gd_whelp":{"at":"z"},"gd_imp":{"at":0},"mt_boar":{"at":1},"nope":{}},"pending":["gd_owl","gd_owl",5,"nope","gd_clock","m_boar"],
    "clears":-3,"autoSkill":"yes","slot2Seen":1,"last":{"mount":"gd_imp","guards":"x"}}`);
  s.heroes.kael.companions = { mount: 'gd_owl', guards: ['gd_owl', 'gd_owl'] };
  s.heroes.sera = { ...clone(s.heroes.kael), charId: 'sera', companions: { mount: 'm_boar', guards: [null, 'gd_imp', 'gd_knight'] } };
  noThrow(() => S.migrateCompanions(s), '쓰레기 세이브');
  const c = s.companions;
  eq(Object.keys(c.owned).sort(), ['gd_fairy', 'gd_imp', 'gd_knight', 'gd_owl', 'mt_boar'], '모르는 id·__proto__ 제거, 옛 id 이전, 조건 해금');
  eq(c.owned.mt_boar, { lv: 1, exp: 0, bond: 200, got: 0, src: 'migrate', gift: -1, seen: false });
  eq([c.owned.gd_imp.lv, c.owned.gd_imp.exp, c.owned.gd_imp.bond], [30, 0, 0]);
  eq([c.owned.gd_knight.lv, c.owned.gd_knight.bond], [1, 0]);
  eq([c.owned.gd_owl.lv, c.owned.gd_owl.exp, c.owned.gd_owl.bond], [4, 12, 40]);
  ok(!Object.getPrototypeOf(c.owned) || Object.getPrototypeOf(c.owned) === Object.prototype, 'owned 프로토타입 오염');
  eq(c.eggs, { gd_whelp: { at: -99, got: 0 } }, '알 정리');
  eq(c.pending, ['gd_owl', 'mt_boar', 'gd_fairy'], 'pending: 보유한 id 한 번씩 + 새 해금');
  eq([c.clears, c.autoSkill, c.slot2Seen], [0, null, false]);
  eq(c.last, { mount: null, guards: [null, null] }, '자동 장착할 빈 칸이 없으면 last 도 그대로');
  eq(s.heroes.kael.companions, { mount: null, guards: ['gd_owl', null] }, '탈것 칸의 수호신 제거, 중복 제거');
  eq(s.heroes.sera.companions, { mount: 'mt_boar', guards: ['gd_imp', null] }, '3장: 2번 칸을 1번 칸으로');
  const once = clone(s); S.migrateCompanions(s); eq(s, once, '쓰레기 보정 후 멱등');
});
t('영웅·진행도 자체가 손상돼도 던지지 않는다', () => {
  for (const mut of [(s) => { s.heroes = 5; }, (s) => { s.progress = null; }, (s) => { s.heroes.kael = null; }, (s) => { s.quests = 'x'; },
    (s) => { s.progress.bosses = 'b_banshee'; }, (s) => { s.progress.flags = null; }, (s) => { s.charId = 'nobody'; }, (s) => { s.heroes.kael.level = 'x'; }]) {
    const s = oldSave({ chapter: 8, bosses: ['b_banshee'] }); mut(s);
    noThrow(() => { S.migrateCompanions(s); S.evaluateUnlocks(s); S.companionAuraStats(s, null); S.heroLoadout(s, null); S.equippedIds(s); S.loadoutKey(s); }, mut.toString());
  }
  for (const v of [null, undefined, 5, 'x', []]) noThrow(() => { S.migrateCompanions(v); eq(S.ensureCompanionState(v), null); eq(S.ownedIds(v), []); eq(S.unlockCompanion(v, 'gd_fairy'), null); }, String(v));
});
t('무작위 손상 500회: 예외 없음 · 불변식 · 멱등', () => {
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const junk = () => [null, 5, -1, 'x', [], {}, true, NaN, 1e12, 'gd_fairy', 'm_boar', 'mt_gale', '__proto__', { lv: 'a' }][Math.floor(rnd() * 14)];
  const ids = [...D.COMPANION_ORDER, 'm_warhorse', 'g_owl', 'zzz'];
  for (let i = 0; i < 500; i++) {
    const s = oldSave({ chapter: Math.floor(rnd() * 21), bosses: Object.keys(BOSSES).filter(() => rnd() < 0.3), level: 1 + Math.floor(rnd() * 60) });
    S.migrateCompanions(s);
    for (const id of ids) if (rnd() < 0.3) S.unlockCompanion(s, id);
    const c = s.companions;
    for (let k = 0; k < 6; k++) {
      const pick = ids[Math.floor(rnd() * ids.length)];
      const where = Math.floor(rnd() * 6);
      if (where === 0) c.owned[pick] = junk();
      else if (where === 1) c.eggs[pick] = junk();
      else if (where === 2) c.pending.push(junk());
      else if (where === 3) s.heroes.kael.companions.guards[Math.floor(rnd() * 3)] = junk();
      else if (where === 4) s.heroes.kael.companions.mount = junk();
      else c[['clears', 'autoSkill', 'slot2Seen', 'last'][Math.floor(rnd() * 4)]] = junk();
    }
    noThrow(() => S.migrateCompanions(s), '무작위 #' + i);
    const once = clone(s);
    S.migrateCompanions(s);
    eq(s, once, '무작위 멱등 #' + i);
    for (const [id, e] of Object.entries(c.owned)) ok(D.companionDef(id) && e.lv >= 1 && e.lv <= 30 && e.exp >= 0 && e.bond >= 0 && e.bond <= 200, '불변식 owned ' + id);
    for (const id of c.pending) ok(Object.hasOwn(c.owned, id), '불변식 pending ' + id);
    const L = s.heroes.kael.companions;
    ok(L.mount === null || (D.isMountId(L.mount) && c.owned[L.mount]), '불변식 mount');
    ok(L.guards.length === 2 && L.guards.every((g) => g === null || (D.isGuardianId(g) && c.owned[g])), '불변식 guards');
    ok(!(L.guards[0] && L.guards[0] === L.guards[1]), '불변식 중복');
    if (S.guardianSlots(s) < 2) ok(L.guards[1] === null, '불변식 2번 칸');
  }
});
t('모든 동료 + 알이 있어도 세이브가 작다', () => {
  const s = freshState({ chapter: 20 }); S.applyCompanionDebug(s, 'cmp=all&cmplv=30&bond=5');
  const n = JSON.stringify(s.companions).length + JSON.stringify(s.heroes.kael.companions).length;
  ok(n < 4096, '동료 데이터 ' + n + ' 바이트');
});

// ══ 4. 상태 API (§12.2) ═════════════════════════════════════════════════════════════════════
console.log('4. 상태 API');
t('unlockCompanion: 멱등 · 이벤트 1번 · 따라잡기 레벨', () => {
  const s = freshState({ level: 50 });
  const ev = listen('companionUnlocked');
  const e1 = S.unlockCompanion(s, 'gd_owl', { source: 'boss' });
  const e2 = S.unlockCompanion(s, 'gd_owl', { source: 'boss' });
  ev.off();
  ok(e1 && e1 === e2, '같은 항목'); eq(ev.got, [{ id: 'gd_owl', source: 'boss' }]);
  eq([e1.lv, e1.exp, e1.bond, e1.src, e1.gift, e1.seen], [25, 0, 0, 'boss', -1, false]);
  ok(Number.isFinite(e1.got) && e1.got > 0, 'got');
  eq(s.companions.pending, ['gd_owl']);
  eq(S.unlockCompanion(s, 'nope'), null);
  const low = freshState({ level: 1 }); eq(S.unlockCompanion(low, 'mt_boar').lv, 1);
  eq(S.startLevelFor(freshState({ level: 10 })), 7); eq(S.startLevelFor(freshState({ level: 36 })), 25); eq(S.startLevelFor(freshState({ level: 35 })), 25);
  eq(S.startLevelFor(freshState({ level: 30 })), 21);
  const q = freshState(); S.unlockCompanion(q, 'gd_imp', { silent: true, reveal: false, equip: false });
  eq([q.companions.pending, q.companions.owned.gd_imp.seen, q.heroes.kael.companions.guards], [[], true, [null, null]]);
});
t('자동 장착: 현재 영웅의 빈 칸만, last 갱신', () => {
  const s = freshState({ chapter: 8 });
  S.unlockCompanion(s, 'gd_fairy'); S.unlockCompanion(s, 'gd_knight'); S.unlockCompanion(s, 'gd_owl'); S.unlockCompanion(s, 'mt_boar'); S.unlockCompanion(s, 'mt_warhorse');
  eq(s.heroes.kael.companions, { mount: 'mt_boar', guards: ['gd_fairy', 'gd_knight'] });
  eq(s.companions.last, s.heroes.kael.companions);
  ok(s.companions.last !== s.heroes.kael.companions, 'last 는 복사본');
  s.heroes.sera = { ...clone(s.heroes.kael), charId: 'sera' }; delete s.heroes.sera.companions;
  eq(S.heroLoadout(s, 'sera'), { mount: 'mt_boar', guards: ['gd_fairy', 'gd_knight'] }, '편성이 없는 영웅은 last 를 복사');
});
t('경험치: 레벨업 · 최대 30 · 이벤트', () => {
  const s = freshState({ level: 1 }); S.unlockCompanion(s, 'mt_boar');
  const ev = listen('companionLevelUp');
  eq(S.addCompanionExp(s, 'mt_boar', 79), 0); eq(S.ownedEntry(s, 'mt_boar').exp, 79);
  eq(S.addCompanionExp(s, 'mt_boar', 1), 1); eq([S.ownedEntry(s, 'mt_boar').lv, S.ownedEntry(s, 'mt_boar').exp], [2, 0]);
  eq(S.addCompanionExp(s, 'mt_boar', D.cexpToNext(2) + D.cexpToNext(3) + 5), 2); eq([S.ownedEntry(s, 'mt_boar').lv, S.ownedEntry(s, 'mt_boar').exp], [4, 5]);
  eq(S.addCompanionExp(s, 'mt_boar', 1e9), 26); eq([S.ownedEntry(s, 'mt_boar').lv, S.ownedEntry(s, 'mt_boar').exp], [30, 0]);
  eq(S.addCompanionExp(s, 'mt_boar', 500), 0);
  ev.off();
  eq(ev.got.map((d) => [d.id, d.level]), [['mt_boar', 2], ['mt_boar', 4], ['mt_boar', 30]]);
  for (const bad of [-5, 0, NaN, Infinity, 'x']) eq(S.addCompanionExp(s, 'mt_boar', bad), 0);
  eq(S.addCompanionExp(s, 'gd_fairy', 100), 0, '보유하지 않은 동료');
  eq(S.expInfo(s, 'mt_boar'), { lv: 30, exp: 0, need: 0, max: true });
});
t('유대: 단계 · 상한 200 · 이벤트', () => {
  const s = freshState(); S.unlockCompanion(s, 'gd_fairy');
  const ev = listen('bondUp');
  eq(S.addBond(s, 'gd_fairy', 14), 0); eq(S.addBond(s, 'gd_fairy', 1), 1); eq(S.bondRankOf(s, 'gd_fairy'), 1);
  eq(S.addBond(s, 'gd_fairy', 120), 3); eq(S.bondRankOf(s, 'gd_fairy'), 4);
  eq(S.addBond(s, 'gd_fairy', 999), 1); eq(S.ownedEntry(s, 'gd_fairy').bond, 200);
  eq(S.addBond(s, 'gd_fairy', -500), 0); eq(S.ownedEntry(s, 'gd_fairy').bond, 0);
  ev.off();
  eq(ev.got, [{ id: 'gd_fairy', rank: 1 }, { id: 'gd_fairy', rank: 4 }, { id: 'gd_fairy', rank: 5 }]);
  eq(S.bondInfo(s, 'gd_fairy'), { points: 0, rank: 0, name: '낯선 사이', next: 15 });
});
t('수호신 칸: 7장 1칸 → 8장 2칸', () => {
  eq(S.guardianSlots(freshState({ chapter: 7 })), 1); eq(S.guardianSlots(freshState({ chapter: 8 })), 2); eq(S.guardianSlots(freshState({ chapter: 20 })), 2);
  eq(S.guardianSlots({}), 1); eq(S.guardianSlots(null), 1);
});
t('장착: 탈것 · 수호신 (잠금 · 교체 · 해제 · 문구)', () => {
  const s = freshState({ chapter: 3 });
  for (const id of ['mt_warhorse', 'mt_boar', 'gd_fairy', 'gd_imp']) S.unlockCompanion(s, id, { equip: false });
  eq(S.equipMount(s, null, 'mt_skelsteed'), { ok: false, msg: '아직 함께하지 않는 동료다' });
  eq(S.equipMount(s, null, 'gd_fairy'), { ok: false, msg: '탈것이 아니다' });
  eq(S.equipMount(s, null, 'mt_warhorse'), { ok: true, msg: '그림메인을 장착했다' });
  eq(S.equipMount(s, 'kael', 'm_boar'), { ok: true, msg: '바르그를 장착했다' });
  eq(s.heroes.kael.companions.mount, 'mt_boar');
  eq(S.equipGuardian(s, null, 1, 'gd_imp'), { ok: false, msg: '8장 클리어 시 개방' });
  eq(S.equipGuardian(s, null, 0, 'mt_boar'), { ok: false, msg: '수호신이 아니다' });
  eq(S.equipGuardian(s, null, 2, 'gd_imp').ok, false);
  eq(S.equipGuardian(s, null, 0, 'gd_imp'), { ok: true, msg: '핌을 장착했다' });
  eq(S.equipGuardian(s, null, 0, null), { ok: true, msg: '핌을 해제했다' });
  eq(S.equipMount(s, null, null), { ok: true, msg: '바르그를 해제했다' });
  s.progress.chapter = 8;
  S.equipGuardian(s, null, 0, 'gd_fairy'); S.equipGuardian(s, null, 1, 'gd_imp');
  eq(s.heroes.kael.companions.guards, ['gd_fairy', 'gd_imp']);
  eq(S.equipGuardian(s, null, 0, 'gd_imp').ok, true);
  eq(s.heroes.kael.companions.guards, ['gd_imp', 'gd_fairy'], '다른 칸에 있던 수호신은 자리를 바꾼다');
  eq(s.companions.last, { mount: null, guards: ['gd_imp', 'gd_fairy'] });
  eq(S.equippedIds(s), ['gd_imp', 'gd_fairy']); eq(S.loadoutKey(s), '-|gd_imp|gd_fairy');
  eq(S.equipMount(null, null, 'mt_boar').ok, false);
});
t('오라 능력치 (computeStats 훅 값)', () => {
  const s = freshState({ chapter: 8 });
  S.unlockCompanion(s, 'gd_fairy'); S.unlockCompanion(s, 'gd_owl');
  s.companions.owned.gd_fairy.lv = 1; s.companions.owned.gd_owl.lv = 11;
  eq(S.companionAuraStats(s, s.heroes.kael), { hpRegen: 0.8, resHoly: 10, luck: 10, dropBonus: 12 });
  s.companions.owned.gd_fairy.bond = 40; // 교감 → ×1.5
  eq(S.companionAuraStats(s, 'kael'), { hpRegen: 1.2, resHoly: 15, luck: 10, dropBonus: 12 });
  s.progress.chapter = 7; // 2번 칸 잠김 → 오라도 1칸만
  eq(S.companionAuraStats(s, null), { hpRegen: 1.2, resHoly: 15 });
  eq(S.companionAuraStats(oldSave(), null), {}, '동료 필드가 없는 세이브는 {}');
  eq(S.companionAuraStats(null, null), {});
  // computeStats 에 더하면 (GAME-HOOKS 훅과 같은 줄) 능력치 키가 모두 유효
  const st = computeStats(s, s.heroes.kael); const before = st.hpRegen;
  addStats(st, S.companionAuraStats(s, s.heroes.kael));
  near(st.hpRegen, before + 1.2, 1e-9); ok(Object.keys(S.companionAuraStats(s, null)).every((k) => STAT_KEYS.includes(k)), '능력치 키');
});
t('탈것 파생 수치 (§3.9 · §9)', () => {
  const s = freshState(); S.unlockCompanion(s, 'mt_warhorse');
  const ps = { hp: 1000, atk: 200, mag: 120, moveSpd: 20, crit: 10, critDmg: 50, fire: 12 };
  let d = S.mountDerived(s, 'mt_warhorse', ps);
  eq([d.lv, d.rank, d.maxHp, d.trampleRatio, d.power, d.recall, d.chargeCd, d.specialCd, d.specialMul, d.rideMul], [7, 0, 1008, 0.92, 184, 18.8, 0.7, 3.76, 1, 1]);
  near(d.speedMul, 1.03 * 1.1, 1e-4); eq([d.atkStats.atk, d.atkStats.fire, d.atkStats.crit], [184, 12, 10]);
  eq(d.ride, { dmgReduce: 5 });
  s.companions.owned.mt_warhorse.bond = 200; s.companions.owned.mt_warhorse.lv = 30;
  d = S.mountDerived(s, 'mt_warhorse', ps);
  eq([d.rank, d.maxHp, d.chargeCd, d.specialMul, d.rideMul, d.resonance, d.awakened, d.lastStand], [5, Math.round(1000 * 0.9 * 1.58 * 1.25), 0.49, 1.5, 1.5, true, true, true]);
  eq(d.ride, { dmgReduce: 7.5 }); eq(S.mountRideStats(s, 'mt_warhorse'), { dmgReduce: 7.5 });
  eq(S.mountRideStats(s, 'mt_boar'), { dmgReduce: 8 }, '보유하지 않은 탈것은 기본값');
  eq(S.mountDerived(s, 'gd_fairy', ps), null); ok(S.mountDerived(s, 'mt_gale', null).maxHp > 0, '능력치 없이도 계산');
});
t('수호신 파생 수치 (§4.4 · §4.5)', () => {
  const s = freshState(); S.unlockCompanion(s, 'gd_imp');
  const ps = { atk: 150, mag: 300, crit: 20, critDmg: 60, fire: 30, dark: 10 };
  let g = S.guardianDerived(s, 'gd_imp', ps);
  eq([g.lv, g.rank, g.share, g.power, g.interval, g.skillCd, g.skillMul, g.auraMul, g.assistCd, g.engage], [7, 0, 0.39, 117, 1.2, 26.32, 1, 1, 2.5, 388]);
  eq([g.stats.atk, g.stats.mag, g.stats.crit, g.stats.critDmg, g.stats.fire, g.stats.dark, g.stats.skillDmg], [117, 117, 13.1, 30, 15, 5, 0]);
  s.companions.owned.gd_imp.bond = 130; // 각성
  g = S.guardianDerived(s, 'gd_imp', ps);
  eq([g.rank, g.interval, g.skillMul, g.auraMul, g.assistCd, g.resonance, g.awakened], [4, 1.02, 1.5, 1.5, 1.8, true, true]);
  near(g.power, 300 * 0.39 * 1.16, 1e-9);
  s.companions.owned.gd_imp.bond = 200; eq(S.guardianDerived(s, 'gd_imp', ps).skillCd, 21.06);
  eq(S.guardianDerived(s, 'mt_boar', ps), null);
});
t('알: 획득 → 클리어 2번 → 부화 (§2.1)', () => {
  const s = freshState({ chapter: 5 });
  const ev = listen('eggObtained'), hv = listen('eggHatched');
  eq(S.obtainEgg(s, 'gd_whelp'), true); eq(S.obtainEgg(s, 'gd_whelp'), false); eq(S.obtainEgg(s, 'gd_fairy'), false, '알형이 아니다');
  eq(S.eggStatus(s).map((e) => [e.id, e.ready, e.left, e.text]), [['gd_whelp', false, 2, '따뜻하다… (스테이지 2개 더 클리어)']]);
  eq(S.hatchEgg(s, 'gd_whelp'), null, '아직 부화 불가');
  eq(S.stageClearUpdate(s).eggsReady, []);
  eq(S.eggStatus(s)[0].text, '따뜻하다… (스테이지 1개 더 클리어)');
  eq(S.stageClearUpdate(s).eggsReady, ['gd_whelp']);
  eq(S.eggStatus(s)[0].text, '금이 가기 시작했다!');
  const e = S.hatchEgg(s, 'gd_whelp');
  ok(e && e.src === 'egg', '부화 → 합류'); eq(s.companions.eggs, {}); eq(S.isOwned(s, 'gd_whelp'), true);
  eq(S.obtainEgg(s, 'gd_whelp'), false, '합류한 동료의 알은 다시 안 생긴다');
  ev.off(); hv.off();
  eq([ev.got, hv.got], [[{ id: 'gd_whelp' }], [{ id: 'gd_whelp' }]]);
});
t('스테이지 클리어: clears +1, 장착한 동료 유대 +6', () => {
  const s = freshState({ chapter: 8 });
  for (const id of ['mt_boar', 'gd_fairy', 'gd_imp', 'gd_owl']) S.unlockCompanion(s, id);
  const r = S.stageClearUpdate(s);
  eq([r.clears, r.bond], [1, { mt_boar: 0, gd_fairy: 0, gd_imp: 0 }]);
  eq(['mt_boar', 'gd_fairy', 'gd_imp', 'gd_owl'].map((id) => s.companions.owned[id].bond), [6, 6, 6, 0]);
  S.stageClearUpdate(s); const r3 = S.stageClearUpdate(s);
  eq(r3.bond.gd_fairy, 1, '18 → 신뢰');
  const a = freshState(); a.arcade = { kind: 'bossrush' }; eq(S.stageClearUpdate(a).clears, 0, '아케이드 무시');
});
t('공물: 가격 · 경험치 · 주기당 유대 1번 (§7.3)', () => {
  const s = freshState({ level: 10 }); S.unlockCompanion(s, 'gd_fairy'); // lv 7
  s.gold = 1000;
  eq(S.tributeCost(s, 'gd_fairy'), 100 + 30 * 7);
  eq(S.tributePreview(s, 'gd_fairy'), { cost: 310, exp: Math.floor(D.cexpToNext(7) * 0.3), bond: 8 });
  const r1 = S.giveTribute(s, 'gd_fairy');
  eq([r1.ok, r1.cost, r1.exp, r1.bond, s.gold], [true, 310, Math.floor(D.cexpToNext(7) * 0.3), 8, 690]);
  eq(r1.msg, `아리아가 공물을 반겼다! (경험치 +${r1.exp} · 유대 +8)`);
  eq(S.ownedEntry(s, 'gd_fairy').gift, 0);
  const r2 = S.giveTribute(s, 'gd_fairy');
  eq([r2.ok, r2.bond, s.gold, S.ownedEntry(s, 'gd_fairy').bond], [true, 0, 380, 8]);
  ok(r2.msg.endsWith('유대는 다음 스테이지를 다녀온 뒤에 더 깊어진다'), r2.msg);
  S.stageClearUpdate(s); // 장착 중이라 유대 +6 도 함께
  const r3 = S.giveTribute(s, 'gd_fairy');
  eq([r3.ok, r3.bond, S.ownedEntry(s, 'gd_fairy').bond], [true, 8, 22]);
  s.gold = 10;
  eq([S.giveTribute(s, 'gd_fairy').ok, S.giveTribute(s, 'gd_fairy').msg, s.gold], [false, '금화가 모자라다', 10]);
  eq(S.giveTribute(s, 'gd_owl').ok, false);
  s.gold = 1e6; s.companions.owned.gd_fairy.lv = 30; s.companions.owned.gd_fairy.exp = 0;
  eq(S.giveTribute(s, 'gd_fairy').exp, 0, '최대 레벨은 경험치 없음');
});
t('마구간 구입: 입고 챕터 · 금화 · 중복 (§7.3)', () => {
  const s = freshState({ chapter: 1 }); s.gold = 20000;
  eq(S.buyCompanion(s, 'mt_boar'), { ok: false, msg: '2장 클리어 후 입고' });
  s.progress.chapter = 2;
  eq(S.buyCompanion(s, 'gd_imp'), { ok: false, msg: '3장 클리어 후 입고' });
  eq(S.buyCompanion(s, 'mt_boar'), { ok: true, msg: '바르그가 동료가 되었다!' }); eq(s.gold, 14000);
  eq(s.companions.owned.mt_boar.src, 'shop'); eq(s.companions.pending, ['mt_boar']);
  eq(S.buyCompanion(s, 'mt_boar'), { ok: false, msg: '이미 함께하고 있다' });
  s.progress.chapter = 3; s.gold = 7499;
  eq(S.buyCompanion(s, 'gd_imp'), { ok: false, msg: '금화가 모자라다' }); eq(s.gold, 7499);
  s.gold = 7500; eq(S.buyCompanion(s, 'gd_imp').ok, true); eq(s.gold, 0);
  eq(S.buyCompanion(s, 'gd_fairy').ok, false, '파는 동료가 아니다');
});
t('evaluateUnlocks: 멱등 · 아케이드 무시 · 이벤트', () => {
  const s = freshState({ chapter: 6 });
  s.progress.bosses = ['b_banshee', 'b_grimoire', 'b_bonedragon']; s.progress.flags.recruit_mt_gale = true;
  const ev = listen('companionUnlocked'), eg = listen('eggObtained');
  eq(S.evaluateUnlocks(s), ['gd_fairy', 'gd_owl', 'mt_gale']);
  eq(S.evaluateUnlocks(s), []);
  ev.off(); eg.off();
  eq(ev.got.map((d) => d.source), ['boss', 'boss', 'story']); eq(eg.got, [{ id: 'gd_whelp' }]);
  eq(S.eggStatus(s)[0].ready, true, '소급 알은 바로 부화 가능');
  const a = freshState({ chapter: 6 }); a.arcade = { kind: 'bossrush' }; a.progress.bosses = ['b_banshee'];
  eq(S.evaluateUnlocks(a), []); S.migrateCompanions(a); eq(S.ownedIds(a), []);
});
t('pending / markSeen', () => {
  const s = freshState(); S.unlockCompanion(s, 'gd_fairy'); S.unlockCompanion(s, 'mt_boar');
  eq(S.pendingIds(s), ['gd_fairy', 'mt_boar']);
  eq(S.markSeen(s, 'gd_fairy'), true); eq(S.pendingIds(s), ['mt_boar']); eq(s.companions.owned.gd_fairy.seen, true);
  eq(S.markSeen(s, 'gd_owl'), false);
});

// ══ 5. 버스 연결 · game.companions (companion_events.js) ═══════════════════════════════════
console.log('5. 버스 연결');
function fakeGame(state, mode = 'story') { return { state, world: mode ? { mode } : null, toasts: [], toast(text, color, time) { this.toasts.push([text, color, time]); } }; }
t('initCompanions: API 묶기 · 보스 처치 → 합류/알 토스트', () => {
  const g = fakeGame(freshState({ chapter: 5 }));
  const api = E.initCompanions(g);
  ok(api === g.companions && typeof api.recruit === 'function' && typeof api.unlock === 'function', 'game.companions');
  bus.emit('bossKilled', { bossId: 'b_dullahan', stageId: 's03', time: 100 });
  bus.emit('bossKilled', { bossId: 'b_bonedragon', stageId: 's05', time: 100 });
  bus.emit('bossKilled', { bossId: 'b_dullahan', stageId: 's03', time: 100 });
  eq(S.ownedIds(g.state), ['mt_skelsteed']); eq(g.state.companions.owned.mt_skelsteed.src, 'boss');
  eq(S.eggStatus(g.state).map((e) => [e.id, e.ready, e.left]), [['gd_whelp', false, 2]]);
  eq(g.toasts, [['새 동료 합류 — 「코슈타」! 마을로 돌아가면 만날 수 있다', '#ffd070', 3.2], ['「본 드래곤의 알」을 손에 넣었다 — 영혼의 마구간에 맡기자', '#e8c872', 3.2]]);
});
t('아케이드 월드·아케이드 세이브·세이브 없음은 무시', () => {
  const g = fakeGame(freshState({ chapter: 5 }), 'bossrush'); E.initCompanions(g);
  bus.emit('bossKilled', { bossId: 'b_banshee' }); bus.emit('stageCleared', { stageId: 's02' });
  eq([S.ownedIds(g.state), g.state.companions.clears], [[], 0]);
  const st = freshState(); st.arcade = { kind: 'survival' }; const g2 = fakeGame(st, 'story'); E.initCompanions(g2);
  bus.emit('bossKilled', { bossId: 'b_banshee' }); eq(S.ownedIds(st), []);
  const g3 = fakeGame(null); E.initCompanions(g3);
  noThrow(() => { bus.emit('bossKilled', { bossId: 'b_banshee' }); bus.emit('stageCleared', {}); bus.emit('questClaimed', null); bus.emit('relicFound'); }, '세이브 없음');
  eq(g3.companions.recruit('gd_mirra'), null);
});
t('스테이지 클리어 → clears · 유대 · 유대 토스트 (월드 없음 = 결과 화면)', () => {
  const st = freshState({ chapter: 4 }); S.unlockCompanion(st, 'mt_boar'); st.companions.owned.mt_boar.bond = 10;
  const g = fakeGame(st, null); E.initCompanions(g);
  bus.emit('stageCleared', { stageId: 's04', rank: 'A' });
  eq([st.companions.clears, st.companions.owned.mt_boar.bond], [1, 16]);
  eq(g.toasts, [['「바르그」와의 유대가 깊어졌다 — 신뢰', '#ffb0d0', 2.8]]);
});
t('의뢰 보상 수령(마을) → 하티 합류', () => {
  const g = fakeGame(freshState({ chapter: 2 }), 'town'); E.initCompanions(g);
  bus.emit('questClaimed', { questId: 'cq_hati', reward: {} }); bus.emit('questClaimed', { questId: 'bd_ghoul', reward: {} });
  eq(S.ownedIds(g.state), ['gd_spiritwolf']); eq(g.state.companions.owned.gd_spiritwolf.src, 'quest');
  eq(g.toasts.map((x) => x[0]), ['새 동료 합류 — 「하티」!']);
});
t('유물 5개째 → 녹티스 합류', () => {
  const st = freshState({ chapter: 11 }); st.progress.relics = ['k_relic_1', 'k_relic_2', 'k_relic_3', 'k_relic_4'];
  const g = fakeGame(st); E.initCompanions(g);
  bus.emit('relicFound', { id: 'k_relic_4' }); eq(S.isOwned(st, 'mt_giantbat'), false);
  st.progress.relics.push('k_relic_5'); bus.emit('relicFound', { id: 'k_relic_5' });
  eq(st.companions.owned.mt_giantbat.src, 'relics'); eq(g.toasts.length, 1);
  eq(D.MOUNTS.mt_giantbat.obtain.script, 'cmp_bat_arrive');
});
t('recruit (스토리 명령): 플래그 + 합류 · 불러오기에서도 플래그로 복구', () => {
  const st = freshState({ chapter: 14, level: 50 }); const g = fakeGame(st, null); E.initCompanions(g);
  const ev = listen('companionUnlocked');
  const e = g.companions.recruit('gd_mirra'); g.companions.recruit('gd_mirra');
  ev.off();
  ok(e && e.lv === 25 && e.src === 'story', '합류 항목');
  eq([st.progress.flags.recruit_gd_mirra, st.companions.pending, ev.got.length], [true, ['gd_mirra'], 1]);
  eq(g.companions.recruit('nope'), null);
  // 플래그만 남고 동료가 없는 세이브 (합류 직전에 게임이 꺼진 경우) → 불러오기에서 합류
  const lost = clone(st); delete lost.companions.owned.gd_mirra; lost.companions.pending = [];
  S.migrateCompanions(lost); eq(S.isOwned(lost, 'gd_mirra'), true);
  const ar = freshState(); ar.arcade = { kind: 'bossrush' }; const ga = fakeGame(ar, null); E.initCompanions(ga);
  eq(ga.companions.recruit('gd_lumen'), null); eq(ar.progress.flags.recruit_gd_lumen, true);
});
t('unlock / evaluate API · 다시 init 해도 구독이 겹치지 않는다', () => {
  const st = freshState({ chapter: 3 }); const g = fakeGame(st, 'story');
  E.initCompanions(g); E.initCompanions(g); E.initCompanions(g);
  bus.emit('bossKilled', { bossId: 'b_banshee' });
  eq(g.toasts.length, 1, '토스트 1번');
  ok(g.companions.unlock('mt_boar', { source: 'shop', toast: true }), 'unlock');
  eq(g.toasts[1][0], '새 동료 합류 — 「바르그」! 마을로 돌아가면 만날 수 있다');
  g.companions.unlock('mt_boar', { toast: true }); eq(g.toasts.length, 2, '이미 있으면 토스트 없음');
  st.progress.flags.stable_open = true; eq(g.companions.evaluate(), ['mt_warhorse']);
  eq(g.companions.state(), st.companions);
});

// ══ 6. 디버그 파라미터 ════════════════════════════════════════════════════════════════════
console.log('6. 디버그');
t('cmp=all · cmplv · mount · guards(2칸이면 8장) · ride', () => {
  const s = freshState({ chapter: 0 });
  const r = S.applyCompanionDebug(s, new URLSearchParams('cmp=all&cmplv=10&mount=mt_warhorse&guards=gd_knight,g_imp&ride=1'));
  eq(S.ownedIds(s).length, 20); eq(r.granted.length, 20); eq(r.ride, true);
  ok(Object.values(s.companions.owned).every((e) => e.lv === 10 && e.src === 'debug' && e.seen), '레벨·출처');
  eq(s.companions.pending, []); eq(s.progress.chapter, 8); eq(s.heroes.kael.companions, { mount: 'mt_warhorse', guards: ['gd_knight', 'gd_imp'] });
  eq(s.companions._debug, { ride: true }); ok(!JSON.stringify(s).includes('_debug'), '_debug 는 저장되지 않는다');
  eq(s.progress.flags.stable_open, true); eq(s.companions.slot2Seen, true);
  eq(E.applyCompanionDebug, S.applyCompanionDebug, 'companion_events 가 같은 함수를 내보낸다');
});
t('cmp= 빈 값 + ch=1 → 동료 없음 (그레타 소개 테스트)', () => {
  const s = freshState(); S.applyCompanionDebug(s, 'cmp=&ch=1');
  eq([S.ownedIds(s), s.progress.chapter, s.progress.flags.stable_open], [[], 1, undefined]);
});
t('bond · egg · 목록 · 객체 파라미터 · 잘못된 값', () => {
  const s = freshState({ chapter: 5 });
  S.applyCompanionDebug(s, { cmp: 'mt_boar,gd_fairy,nope', bond: 3, egg: 'gd_whelp,mt_boar' });
  eq(S.ownedIds(s), ['mt_boar', 'gd_fairy']); eq(S.bondRankOf(s, 'gd_fairy'), 3); eq(s.heroes.kael.companions.guards, ['gd_fairy', null]);
  eq(S.eggStatus(s).map((e) => [e.id, e.ready]), [['gd_whelp', true]]);
  S.applyCompanionDebug(s, 'bond=150'); eq(s.companions.owned.mt_boar.bond, 150);
  S.applyCompanionDebug(s, 'mount=none'); eq(s.heroes.kael.companions.mount, null);
  const before = clone(s);
  for (const p of [null, undefined, 5, '', 'foo=1', {}, new Map()]) noThrow(() => S.applyCompanionDebug(s, p), String(p));
  eq(s, before, '알려진 키가 없으면 그대로');
  noThrow(() => S.applyCompanionDebug(null, 'cmp=all'), 'state 없음');
  noThrow(() => S.applyCompanionDebug(s, 'cmplv=abc&bond=x&ch=zz&guards=,,,&mount=gd_fairy'), '잘못된 숫자');
  const k = freshState(); S.applyCompanionDebug(k, 'mount=gd_owl&guards=mt_boar,nope');
  eq(S.ownedIds(k), [], '종류가 틀린 id 는 지급하지 않는다');
});

// ══ 7. 모듈 순수성 (node import · import 대상) ════════════════════════════════════════════
console.log('7. 모듈 순수성');
t('data/companions.js 는 data 만, companion_state.js 는 data + core/events.js 만, companion_events.js 는 + companion_state.js 만 import', () => {
  const imports = (f) => [...readFileSync(path.join(ROOT, f), 'utf8').matchAll(/^\s*(?:import|export)\s[^'"]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  eq(imports('src/data/companions.js'), ['./items.js']);
  ok(imports('src/game/companion_state.js').every((p) => p === '../core/events.js' || p.startsWith('../data/')), imports('src/game/companion_state.js').join(','));
  ok(imports('src/game/companion_events.js').every((p) => p === '../core/events.js' || p.startsWith('../data/') || p === './companion_state.js'), imports('src/game/companion_events.js').join(','));
  for (const f of ['src/data/companions.js', 'src/game/companion_state.js', 'src/game/companion_events.js']) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    ok(!/\b(window|document|localStorage|navigator)\b/.test(src.replace(/\/\/.*$/gm, '')), f + ' 가 DOM 을 쓴다');
    ok(!src.includes('STUB (W0 SKEL)'), f + ' 에 스텁 머리말이 남아 있다');
  }
});
t('W0 스텁의 export 이름이 모두 남아 있다 (R6)', () => {
  const need = {
    D: ['CMP_MAX_LV', 'BOND_RANKS', 'BOND_NAMES', 'MOUNTS', 'GUARDIANS', 'MOUNT_IDS', 'GUARDIAN_IDS', 'COMPANION_ORDER', 'STABLE_SHOP', 'TRIBUTE', 'COMPANION_QUESTS', 'STABLE_LINES', 'DISMOUNT_NOTE',
      'companionDef', 'cexpToNext', 'guardianShare', 'trampleRatio', 'cdMul'],
    S: ['ensureCompanionState', 'migrateCompanions', 'heroLoadout', 'isOwned', 'ownedIds', 'ownedEntry', 'unlockCompanion', 'startLevelFor', 'addCompanionExp', 'addBond', 'bondRankOf',
      'guardianSlots', 'equipMount', 'equipGuardian', 'companionAuraStats', 'mountRideStats', 'mountDerived', 'guardianDerived', 'evaluateUnlocks', 'obtainEgg', 'eggStatus', 'hatchEgg',
      'tributeCost', 'giveTribute', 'buyCompanion', 'applyCompanionDebug'],
    E: ['initCompanions', 'applyCompanionDebug'],
  };
  for (const [k, names] of Object.entries(need)) { const M = { D, S, E }[k]; for (const n of names) ok(n in M, `${k}.${n} 없음`); }
  eq(D.DISMOUNT_NOTE.forced, '공간이 좁아 탈것을 돌려보냈다');
});

// ══ 8. 참고: 수호신 딜 비중 모형 (정보용, 판정 없음 — 최종 판정은 tools/balance_companions.mjs) ══════════
{
  const up = { proj: 0.9, burst: 0.9, zap: 0.9, cone: 0.75, dive: 0.8, blink: 0.8, pounce: 0.6, slash: 0.6, bite: 0.6 };
  const autoMv = (g) => {
    const a = g.attack; let mv = a.mv;
    if (a.kind === 'pounce') mv *= a.bites; if (a.kind === 'slash') mv *= a.hits; if (a.kind === 'burst') mv *= a.count;
    if (a.kind === 'cone') mv *= Math.round(a.dur / a.rehit); if (a.explode) mv += a.explode.mv; if (a.chain) mv *= 1 + a.chainMul * a.chain;
    return (mv / a.interval) * (up[a.kind] ?? 0.8);
  };
  const skillMv = (g) => { const k = g.skill; const n = k.count && k.mv ? (g.id === 'gd_whelp' ? 5 : g.id === 'gd_mirra' ? 1 : k.count) : 1;
    const per = k.len ? k.mv * Math.round(k.dur / k.rehit) : (k.mv ?? 0) * n; return per / k.cd; };
  const assistMv = (g) => (g.assist.mv * (g.assist.count ?? 1)) / 4;
  const rows = [];
  for (const id of D.GUARDIAN_IDS) {
    const g = D.GUARDIANS[id], base = autoMv(g) + skillMv(g) + assistMv(g);
    const at = (lv, rank) => { const x = base * D.guardianShare(lv) * (1 + 0.04 * rank); return Math.round((x / (3.25 + x)) * 1000) / 10; };
    rows.push(`${g.name.padEnd(5, '　')} Lv1 ${at(1, 0)}%  Lv10 ${at(10, 1)}%  Lv20 ${at(20, 3)}%  Lv30·유대5 ${at(30, 5)}%`);
  }
  console.log('8. 참고 — 수호신 딜 비중 (거친 모형, 플레이어 3.25 mv/s):\n   ' + rows.join('\n   '));
}

console.log(`\n${fail ? '실패' : '통과'}: ${pass} 통과, ${fail} 실패`);
if (fail) { console.log('실패 목록:\n - ' + fails.join('\n - ')); process.exit(1); }
