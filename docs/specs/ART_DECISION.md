# Art decision (lead) — overrides MASTER_PLAN §1.15 "TBD"

Decided after the bake-off (prototypes in tools/.proto_heroA/B, tools/.proto_bossA/B):

- **All characters and creatures use painted cut-out puppets made from Kling art, with procedural VFX layered on top.**
  This covers heroes, NPCs, regular enemies, bosses (Part 1 and Part 2), mounts and guardians. The goal is no visual dissonance with the painted Kling backgrounds, portraits and CGs.
- The **vector renderers stay** as the fallback while assets load or when an asset is missing. They also stay for anything not converted yet. Never delete them.

## Runtimes and playbooks (being finished by in-flight agents = EXT-ARTBAKEOFF)
| Scope | Runtime | Assets | Build tools | Playbook |
|---|---|---|---|---|
| Heroes (6 × 7 classes) + NPCs | `src/render/hero_puppet.js` + hooks in `src/render/hero.js` | `assets/puppets/<charId>/<classId>/` | `tools/puppet/` | `docs/art/PUPPET_PIPELINE.md` |
| Bosses | `src/render/painted/kit.js`, `registry.js`, `src/render/painted/bosses/<id>.js`; hooks in `a_common.js` / `b_common.js` | `assets/painted/bosses/<id>/` | `tools/painted/` | `docs/art/BOSS_PIPELINE.md` |
| Regular enemies | `src/render/painted/enemy_kit.js`, `src/render/painted/enemies/<id>.js`; hook in `src/game/enemy.js` / `src/render/enemies.js` | `assets/painted/enemies/<id>/` | `tools/painted/enemies/` | `docs/art/ENEMY_PIPELINE.md` |

## Consequences for the master plan
- **ART-KIT** becomes "finalize and merge": it reconciles the three runtimes after the in-flight core agents finish (shared kit, assets EXT entries, preload hooks, quality flags). It does not build a new kit.
- **ART-ENEMY-SPLIT is cancelled.** Production agents create new per-creature files under `src/render/painted/**`, so nobody needs to edit the big vector files in parallel. `enemies_a.js` and `enemies_b.js` stay untouched as the fallback.
- **ART-HERO-A/B** become hero production. Each package produces the remaining heroes (sera, victor, bran, lia, azel; 7 classes each) and the town NPCs by following `PUPPET_PIPELINE.md`. Kael is done by the core agent.
- **ART-BOSS-1..5** become painted production of the other 12 Part 1 bosses: one new `src/render/painted/bosses/<id>.js` + assets per boss, no logic edits. Hurtbox or cull changes must be proposed, not applied silently.
- **ART-ENEMY-1..4** become painted production of the remaining 62 Part 1 enemies, split by id list: one new `src/render/painted/enemies/<id>.js` + assets per enemy, tiered per `ENEMY_PIPELINE.md`.
- **Part 2** enemy art packages (ENEMY-P2-*-ART) and boss packages (BOSS-P2-*) must render with the painted kits. They may keep a quick vector fallback.
- **Companion art** packages (CMP-MOUNT-ART-*, CMP-GUARD-ART-*) use the painted kit. Mounts are painted quadruped or flyer puppets; guardians are painted puppets or T1 sprites. The rider pose goes through the `heroHooks.rider` contract in `hero.js`.
- **Hero draw scale:** 1.12–1.15 for player heroes only, as chosen by the hero core agent; hurtboxes unchanged. No camera zoom.
- **Budgets:** Kling images per creature per the playbooks. Always crop the watermark. Keep per-package manifests in `tools/kling/manifest_<package>.json`, never edit a shared manifest.
