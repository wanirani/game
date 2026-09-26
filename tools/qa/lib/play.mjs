// Gameplay helpers shared by the input suites (pad, touch).
//
//   await prepPlayer(s)                 // invulnerable, 60 hearts, full MP, 2–4 active skills in the slots, no enemies,
//                                       // story triggers of the room disarmed (no dialogue opens mid-check)
//   const frames = await during(s, () => press(s.page, BTN.A), 450)   // per-frame state while doing something
//   await refill(s)                     // MP, sub-weapon/dash/skill cooldowns back to ready

export async function prepPlayer(s) {
  await s.eval(async () => {
    const g = window.__game, w = g.world, p = w?.player;
    if (!p) return;
    p.buffs.invincible = 9999;
    w.run.hearts = 60;
    try {
      const S = await import('/src/data/skills.js');
      const hero = p.hero;
      const tree = S.SKILL_TREES?.[hero.charId || g.state.charId];
      const act = [];
      if (tree) for (const b of tree.branches) for (const id of b.skills) if (S.SKILLS[id]?.type === 'active' && act.length < 4) act.push(id);
      for (const id of act) hero.skills[id] = Math.max(1, hero.skills[id] || 0);
      hero.slots = [act[0] ?? null, act[1] ?? null, act[2] ?? null, act[3] ?? null];
      p.refreshStats?.();
    } catch (e) { console.warn('qa seed skills', e); }
    p.mp = p.stats?.mp ?? 999;
    for (const e of w.enemies?.() || []) { e.hp = 0; e.dead = true; }
    // story triggers ('!' props) open a dialogue when the hero walks through them (s01 has one a few steps right of
    // the spawn): the input checks walk and dash, and a dialogue on top would hide the pad and swallow the input
    for (const e of w.entities || []) if (e.kind === 'trigger') e.dead = true;
  });
  await s.wait(400);
}

export async function refill(s) {
  await s.eval(() => {
    const p = window.__game.world?.player;
    if (!p) return;
    p.mp = p.stats?.mp ?? 999; p.subCool = 0; p.dashCool = 0;
    for (const k of Object.keys(p.skillCd || {})) p.skillCd[k] = 0;
  });
}

/** Records frames (Session.startRec) while fn runs, plus `tail` ms. */
export async function during(s, fn, tail = 450) {
  await s.startRec();
  await fn();
  await s.wait(tail);
  return s.stopRec();
}
