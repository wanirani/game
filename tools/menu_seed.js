// 메뉴 테스트용 시드: 스모크 테스트에서 eval=import('/tools/menu_seed.js?tab=equip&seed=1') 로 사용
// (smoke 의 --steps 는 쉼표로 나뉘므로 eval 식에 쉼표를 쓰지 않도록 모듈로 분리)
//  seed=1 : 레벨/골드/아이템/비전서/도감 등 풍부한 상태로 채움
//  tab=<id> : 메뉴를 해당 탭으로 바로 연다 (pause 경유 없이)
//  char=<id> : 현재 캐릭터 교체 (ensureHero)
const q = new URL(import.meta.url).searchParams;
const g = window.__game;
const st = g.state;
if (q.get('char')) {
  const { ensureHero } = await import('/src/game/state.js');
  ensureHero(st, q.get('char'));
  st.charId = q.get('char');
}
if (q.get('seed')) {
  const { ITEMS, makeItem } = await import('/src/data/items.js');
  const inv = await import('/src/game/inventory.js');
  const hero = st.heroes[st.charId];
  hero.level = Number(q.get('lv') || 27); hero.exp = 5200; hero.sp = 7;
  st.gold = 48250;
  st.stats.playTime = 3 * 3600 + 27 * 60 + 12; st.stats.kills = 1873; st.stats.deaths = 14; st.stats.maxCombo = 212;
  st.stats.goldEarned = 99120; st.stats.enhanceOk = 23; st.stats.enhanceFail = 9; st.stats.bossKills = 5; st.stats.minigameWins = 7;
  let n = 0;
  for (const id of Object.keys(ITEMS)) {
    const b = ITEMS[id];
    if (b.slot === 'key' && !b.relic) continue;
    const it = makeItem(id, { rarity: (n * 7) % 6, level: b.slot === 'weapon' || b.slot === 'body' ? (n * 5) % 14 : 0 });
    if (!it) continue;
    if (b.stack) it.qty = 3 + (n % 9);
    inv.addItem(st, it);
    n++;
    if (n > 140) break;
  }
  st.progress.docs = ['d01', 'd02', 'd03', 'd05', 'd06', 'd07', 'd09', 'd11', 'd14'];
  st.progress.lore = [];
  try { const L = await import('/src/data/lore.js'); st.progress.lore = Object.keys(L.LORE || {}).slice(0, 6); } catch (e) { /* 없음 */ }
  st.progress.bosses = ['b_nightwing', 'b_banshee', 'b_dullahan'];
  st.progress.relics = ['k_relic_1', 'k_relic_2'];
  st.progress.chapter = 4;
  st.progress.cleared = { s01: { rank: 'S', time: 212, score: 45210 }, s02: { rank: 'A', time: 250, score: 38120 }, s03: { rank: 'SS', time: 280, score: 61200 }, s04: { rank: 'B', time: 322, score: 30990 } };
  st.bestiary = { bat: 42, zombie: 31, skeleton: 25, crow: 18, wolf: 12, possessed: 9, ghost: 14, wisp: 11, bone_thrower: 6, gravedigger: 2, armor_knight: 8, golden_bat: 1, mimic: 2 };
  try {
    const S = await import('/src/data/skills.js');
    const tree = S.SKILL_TREES?.[st.charId];
    if (tree) { let k = 0; for (const b of tree.branches) for (const id of b.skills.slice(0, 2)) { hero.skills[id] = 1 + (k++ % 3); } }
    const act = Object.keys(hero.skills).filter((id) => S.SKILLS[id]?.type === 'active');
    hero.slots = [act[0] ?? null, act[1] ?? null, act[2] ?? null, null];
  } catch (e) { console.warn(e); }
  g.world?.player?.refreshStats();
}
if (q.get('tab')) {
  while (g.scenes.length > 1 && g.top.name !== 'stage' && g.top.name !== 'hub') g.pop();
  g.push('menu', { world: g.world, tab: q.get('tab') });
}
