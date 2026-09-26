// 밸런스 시뮬레이터: 스테이지별 예상 레벨/장비로 일반 적·보스 처치 타수와 받는 피해 비율을 표로 출력
// 사용: node tools/balance.mjs [difficulty=normal] [charId=kael]
import { STAGES, STAGE_ORDER } from '../src/data/stages.js';
import { ENEMIES } from '../src/data/enemies.js';
import { BOSSES } from '../src/data/bosses.js';
import { getDiff } from '../src/data/difficulty.js';
import { enemyStats } from '../src/game/enemy.js';
import { computeStats, expToNext } from '../src/game/stats.js';
import { newHero } from '../src/game/progression.js';
import { makeItem, baseIdFor, tierForLevel } from '../src/data/items.js';
import { CHARACTERS } from '../src/data/characters.js';
import { CLASSES } from '../src/data/classes.js';

const diffId = process.argv[2] || 'normal', charId = process.argv[3] || 'kael';
const diff = getDiff(diffId);
const ch = CHARACTERS[charId];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };

function countEnemies(stage) {
  const ids = [];
  for (const room of Object.values(stage.rooms)) {
    for (const row of room.map) for (const c of row) if (c >= '1' && c <= '9') { const sp = room.enemies?.[c]; const id = typeof sp === 'string' ? sp : sp?.id; if (id && ENEMIES[id] && ENEMIES[id].ai !== 'spawner') ids.push(id); }
  }
  return ids;
}
function heroAt(level, stageIdx) {
  const h = newHero(charId, level);
  // 직업: 10/25 레벨에서 첫 번째 갈래
  let c = CLASSES[h.classId];
  while (c?.next?.length && level >= CLASSES[c.next[0]].reqLevel) { h.classId = c.next[0]; c = CLASSES[h.classId]; }
  const tier = Math.min(6, tierForLevel(level));
  const rar = Math.min(4, 1 + Math.floor(stageIdx / 4));
  const enh = Math.min(10, Math.floor(stageIdx * 0.8));
  const inv = [];
  const put = (slot, id, opts) => { const it = id && makeItem(id, opts); if (it) { inv.push(it); h.equip[slot] = it.uid; } };
  put('weapon', baseIdFor('weapon', tier, { wtype: ch.weaponType }), { rarity: rar, level: enh });
  put('body', baseIdFor('body', tier), { rarity: rar, level: Math.floor(enh * 0.7) });
  put('head', baseIdFor('head', tier), { rarity: rar, level: Math.floor(enh * 0.5) });
  put('cloak', baseIdFor('cloak', tier), { rarity: rar });
  const state = { inventory: inv, heroes: { [charId]: h }, progress: { docs: [] } };
  return { h, s: computeStats(state, h) };
}
function dmg(src, tgt, mv = 1, mag = false) {
  const power = mag ? src.mag : src.atk;
  let d = power * mv;
  const def = mag ? (tgt.res ?? 0) : (tgt.def ?? 0);
  d *= 100 / (100 + Math.max(0, def) * 1.2);
  if (tgt.dmgReduce) d *= 1 - Math.min(75, tgt.dmgReduce) / 100;
  const crit = Math.min(75, src.crit ?? 0) / 100;
  d *= 1 + crit * (0.5 + (src.critDmg ?? 0) / 100);
  return Math.max(1, d);
}
let level = 1, exp = 0;
const rows = [];
STAGE_ORDER.forEach((sid, i) => {
  const st = STAGES[sid];
  const { s: P } = heroAt(level, i);
  const mag = ch.weaponType === 'staff';
  const ids = countEnemies(st);
  const es = ids.map((id) => ({ id, s: enemyStats(ENEMIES[id], st.level, diff, false) }));
  const hits = es.map((e) => Math.ceil(e.s.maxHp / dmg(P, e.s, 1.0, mag)));
  const taken = es.map((e) => dmg(e.s, { def: P.def, dmgReduce: P.dmgReduce, crit: 0 }, 1.0) / P.hp * 100);
  const b = BOSSES[st.boss];
  let bh = 0, bt = 0, bhp = 0;
  if (b) {
    const bs = enemyStats({ ...b, lv: st.level }, st.level, { ...diff, enemyHp: diff.bossHp ?? diff.enemyHp }, false);
    bhp = Math.round(bs.maxHp * (b.hpMul ?? 1) * (1 + Math.max(0, 10 - (st.level - 1)) * 0.1));
    bh = Math.ceil(bhp / dmg(P, bs, 1.0, mag));
    bt = dmg(bs, { def: P.def, dmgReduce: P.dmgReduce }, 1.2) / P.hp * 100;
  }
  rows.push({ stage: sid, elv: st.level, plv: level, atk: mag ? P.mag : P.atk, hp: P.hp, def: P.def, n: ids.length, eHP: med(es.map((e) => e.s.maxHp)), hitsMed: med(hits), hitsMax: Math.max(...hits, 0), takenMed: med(taken).toFixed(1), bossHP: bhp, bossHits: bh, bossTaken: bt.toFixed(1) });
  // 경험치 획득 (85% 처치 + 보스)
  let gain = es.reduce((a, e) => a + e.s.exp, 0) * 0.85;
  if (b) gain += Math.round((b.exp ?? 400) * (1 + st.level * 0.35) * (diff.exp ?? 1));
  exp += gain;
  while (level < 99 && exp >= expToNext(level)) { exp -= expToNext(level); level++; }
});
console.table(rows);
