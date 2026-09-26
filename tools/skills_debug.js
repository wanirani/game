// 스킬 테스트 도우미 (스모크 테스트 전용)
// 사용: --steps "eval=import('/tools/skills_debug.js'),wait:0.3,eval=__T.setup('kael_templar kael_vigilia kael_sanctuary'),skill1:0.05,..."
//  setup(문자열): 공백 구분 토큰 — 직업 id 면 전직, 스킬 id 면 최고 레벨까지 습득(액티브는 슬롯 순서대로 장착)
//  spawn(적id 수) : 전방에 적 배치 / ult() : 필살 게이지 가득 / mp() : MP 회복 / lv(n) : 모든 습득 스킬 레벨 n
import { SKILLS, learnSkill } from '../src/data/skills.js';
import { CLASSES } from '../src/data/classes.js';
import { castTechnique, SKILL_IMPL } from '../src/game/skills.js';

const T = {
  setup(str) {
    const g = window.__game, w = g.world, h = w.hero, p = w.player;
    h.level = 45; h.sp = 999;
    for (const e of w.entities) if (e.kind === 'enemy') e.dead = true;
    const toks = String(str).split(/\s+/).filter(Boolean);
    for (const t of toks) if (CLASSES[t]) h.classId = t;
    const actives = [];
    const deep = (id) => { for (const r of SKILLS[id].req || []) deep(r); for (let i = 0; i < 5; i++) learnSkill(h, id); };
    for (const t of toks) {
      if (!SKILLS[t]) continue;
      deep(t);
      if (SKILLS[t].type === 'active') actives.push(t);
    }
    h.slots = [actives[0] ?? null, actives[1] ?? null, actives[2] ?? null, actives[3] ?? null];
    p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; p.skillCd = {}; p.skillPage = 0;
    return JSON.stringify({ skills: h.skills, slots: h.slots, cls: h.classId });
  },
  /** 조건 무시하고 5레벨로 장착 (시각 확인용) */
  force(str) {
    const w = window.__game.world, h = w.hero, p = w.player;
    for (const e of w.entities) if (e.kind === 'enemy') e.dead = true;
    h.level = 45;
    const ids = String(str).split(/\s+/).filter((t) => SKILLS[t]);
    for (const id of ids) h.skills[id] = SKILLS[id].maxLv;
    h.slots = [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null];
    p.refreshStats(); p.hp = p.stats.hp; p.mp = p.stats.mp; p.skillCd = {}; p.skillPage = 0;
  },
  tech(id) { const w = window.__game.world, p = w.player; p.mp = p.stats.mp; return castTechnique(p, w, { id }); },
  swing(n = 1) { const w = window.__game.world, p = w.player; for (let i = 0; i < n; i++) SKILL_IMPL.__onSwing(p, w, p.moveSet.ground[i % p.moveSet.ground.length]); },
  cls(id) { const w = window.__game.world; w.hero.classId = id; w.player.refreshStats(); },
  lv(n) { const h = window.__game.world.hero; for (const k in h.skills) h.skills[k] = Math.min(n, SKILLS[k]?.maxLv ?? 5); },
  spawn(id = 'skeleton', n = 3, gap = 90, dist = 180) {
    const w = window.__game.world, p = w.player;
    for (let i = 0; i < n; i++) { const e = w.spawnEnemy(id, p.cx + p.facing * (dist + i * gap), p.bottom, { elite: false }); e.hp = e.stats.hp = 99999; if (e.stats) e.stats.maxHp = 99999; e.harmless = true; e.ai = { update() {} }; }
  },
  ult() { window.__game.world.run.sp = 100; },
  mp() { const p = window.__game.world.player; p.mp = p.stats.mp; p.skillCd = {}; },
  god() { const p = window.__game.world.player; p.stats.hp = 99999; p.hp = 99999; },
  page(n) { window.__game.world.player.skillPage = n; },
};
window.__T = T;
export default T;
