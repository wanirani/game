# BLOOD NOCTURNE — Master Build Plan (expansion phase 2)

Plan version 1.1, 2026-09-26. Repository `/home/user/game`, snapshot git HEAD 61d6e20 (14:36 UTC autosave). v1.0 was generated at 2c759a8; v1.1 is the adversarial review pass (problems and fixes in §7).

This plan merges the four new specs into one build order that about ten agents can run in parallel without editing the same file at the same time. It covers the cross-spec decisions (section 1), the waves and their work packages (sections 2 to 4), and the final integration and QA wave, the pre-release audit and the delivery (section 5: W4, W5 and W6). Section 7 lists what the v1.1 review found and changed.

- **Inputs:** `docs/ARCHITECTURE.md`, `docs/specs/feel.md`, `docs/specs/platform.md`, `docs/specs/world2.md`, `docs/specs/companions.md`, `/tmp/claude-0/user_request_2.md`, `/tmp/claude-0/integration_notes.md`.
- **Machine-readable twin:** `docs/specs/master_plan.json`. Both files are generated from one source. If an id or path differs between them, the JSON wins.
- **Package sizes:** S = under 1 agent-hour; M = 1 to 2.5 agent-hours; L = 2.5 to 5 agent-hours; XL = over 5 agent-hours. Used only for painted-mode art packages whose unit of work is one creature or one hero; they checkpoint after every creature (rule R15) so the orchestrator can split the remainder into a new package at any checkpoint.
- **Dependency keys:** a package key; `EXT-*` for work already in flight (§0.2); `GATE:*` for a decision or QA gate (§0.3).
- **`owns` globs:** `**` matches any depth. A leading `!` removes paths from the package's earlier globs (gitignore style).

---

## 0. How to run this plan

### 0.1 Orchestration rules

1. **R1 one owner.** Every file that changes has exactly one owning package per wave (see owns). Other packages in the same wave may only add the append-only hunks listed under appends, placed directly after the given anchor line.
2. **R2 soft barrier.** Waves are soft barriers. A package may start as soon as all of its depends_on are finished AND no file it owns is still owned by a running package of an earlier wave. External (EXT-*) and gate (GATE:*) dependencies must be satisfied as stated in external_packages and gates.
3. **R3 edit style.** Re-read a file right before editing it; use exact string-replacement edits; never reformat, re-indent or rewrite a shared file wholesale; never revert other agents' changes. New files may be written whole.
4. **R4 hook tags.** Every cross-feature hook line carries a trailing tag comment: // [hook:feel] [hook:awaken] [hook:gimmick] [hook:cmp] [hook:plat] [hook:p2]. Later owners must keep tagged lines (move them with the code if they refactor). GAME-HOOKS and WORLD-CAM write /tmp/claude-0/plan/hook_baseline.json ({file: tag count}) when they finish; every later owner of those files re-counts before it reports done, and tools/qa/hook_tags.mjs (QA-TOOLS) enforces it in every W4 round.
5. **R5 stubs.** W0 SKEL creates every new module that another package imports before its owner lands, with the full contracted export list as no-ops and the header '// STUB (W0 SKEL) — owner: <KEY>'. The owner replaces the whole file. Stubs must preserve today's behavior (for example the awaken.js stub fires the normal ultimate).
6. **R6 defensive calls.** Calls into another package use optional chaining (world.gimmickOf?.('wind'), game.companions?.recruit?.(id)). Never access an imported value at module top level (circular-import rule from ARCHITECTURE.md). A missing named export is a link-time SyntaxError that stops the whole game, so (a) a package adds a named import of a NEW export of an existing module only when the provider is in its depends_on (transitively) or the export exists as a W0 placeholder (§1.3); otherwise it imports the module namespace (import * as M) and calls M.name?.(); (b) nobody removes or renames an existing export before W4 (FIX buckets may remove dead exports after a repo-wide grep).
7. **R7 requests.** If a package needs a change in a file it does not own, it appends one JSON line {from, file, owner, what, why} to /tmp/claude-0/plan/requests.jsonl, codes defensively, and continues. Owners read the file when they start and before they finish. Unresolved requests roll into W3 HOOK-SWEEP, then into the W4 fix buckets.
8. **R8 tests before done.** A package is done only when its tests pass, `node tools/integration.mjs` passes for the areas it touches, and the smoke runs it lists show zero pageerror or console errors. Screenshots go to /tmp/claude-0/proto/<KEY>/, throwaway scripts to tools/.proto_<KEY>/ (git-ignored).
9. **R9 no commits.** Do not git commit (the autosave commits). No npm dependencies. No build step for the game itself (only tools/deploy/build_web.mjs for delivery).
10. **R10 Korean text.** Player-facing strings are natural Korean; strings quoted verbatim in a spec are copied verbatim. Use FONT.* and ui.text/bloodText only; never hard-code font families.
11. **R11 art assets.** Kling/Blender work writes its own manifest file (tools/kling/manifest_<pkg>.json); nobody edits the shared tools/kling/manifest.json or cleaned.json. Every visual must render without its image (procedural or hidden fallback).
12. **R12 performance.** New per-frame work uses cached sprites/gradients, scales particle counts by world.fx.quality, honors settings.quality/reduceMotion/flashFx, and stays inside §5.2 budgets.
13. **R13 report.** Each package ends with a short report: contracts provided, deviations from the spec, open requests, test commands run and their results.
14. **R14 frozen files.** A file with no owner in the current wave is frozen. Needed edits go through R7.
15. **R15 painted art.** Painted-mode art packages register creatures only through their own src/render/painted/reg/<key>.js module (created as a stub by ART-KIT), never by editing src/render/painted/registry.js or src/render/painted/enemies/index.js; they load files only through assets.js (packs, lo/ variants and the decoded LRU apply); they checkpoint after every creature (atlas + rig + renderer + reg line + gallery screenshot, reported in /tmp/claude-0/plan/art_progress.jsonl) so a long package can be split at any checkpoint.
16. **R16 hitstop-safe input.** Gameplay code never relies on a single-step input.pressed()/released() edge for anything that can span a freeze: world.update() skips entity updates during hitstop while input.update() keeps stepping (§1.4 rules).

### 0.2 Work already in flight or done (not re-planned)

These packages already own files. A planned package that owns one of their files depends on the entry unless the entry is done. Five of them were not in the lead's list but were writing files in the working tree at 13:56 UTC; three of those (cut-in art, Part 2 Kling art, companion portraits) finished in commit d0347c9. The lead should confirm the other two are running agents; if one is not, spawn it using the entry's notes as its scope.

| key | status | owns | notes |
|---|---|---|---|
| EXT-FONTS | done | src/core/ui.js (FONT, bloodText, TXT_CACHE); assets/fonts/**; css/style.css @font-face block; tools/fonts/**; tools/artifact/blood_nocturne.html (font preload) | Follow-ups are planned in FONTS-FU (W1) and in the owners of the bloodText call sites (§1.16). |
| EXT-APK | done (needs follow-ups) | android/**; tools/apk/**; tools/android/* (keystore, never publish or commit) | Follow-ups: APK-FU (W3) adds the /api proxy, WebView gate, insets and rumble bridges; DELIVER-APK (W6) sets the Netlify origin and rebuilds. |
| EXT-ACCOUNTS | in progress | netlify/functions/**; netlify/lib/**; netlify.toml; src/core/cloud.js; src/scenes/front/account.js; src/scenes/front/cloud_ui.js; src/core/save.js (small hooks); src/main.js (cloud.init hook); src/scenes/title.js; src/scenes/front/slots.js; src/scenes/menu/tab_system.js; src/scenes/reg_front.js; src/core/input.js (possible one-line guard); tools/accounts/**; docs/ACCOUNTS.md; package.json (test:api) | Packages owning any of these files depend on EXT-ACCOUNTS. |
| EXT-QAFIX | finishing | src/game/world.js; src/game/tilemap.js; src/core/camera.js; src/scenes/overlays.js; src/scenes/dialogue.js; src/scenes/town/hub.js; src/core/game.js; src/scenes/stage.js; src/scenes/front/story.js; src/scenes/town/questboard.js; src/scenes/town/shop.js; src/scenes/town/smith.js; src/data/town.js; src/scenes/front/charselect.js; src/scenes/front/arcade_run.js; src/game/pickups.js | Packages owning any of these files depend on EXT-QAFIX. |
| EXT-ARTBAKEOFF | running (hero core: Kael 7 classes; boss core: Bone Dragon; enemy core: 5 references) | src/render/painted/**; painted runtime files: kit.js, registry.js, enemy_kit.js, bosses/b_bonedragon.js, enemies/{index,_biped,skeleton,ghost,…}.js; src/render/hero_puppet.js (new); src/core/assets.js (puppet loader: ext puppets, url(key, ver), json()); tools/painted/**; tools/puppet/**; assets/puppets/**; assets/painted/**; docs/art/** (BOSS_PIPELINE.md, ENEMY_PIPELINE.md, PUPPET_PIPELINE.md); prototype hooks in src/render/hero.js, src/render/enemies.js (painted draw + preload), src/game/bosses/a_common.js and b_common.js (paintedTick/paintedDraw/preloadPainted, already in the tree), src/game/bosses/a_bonedragon.js | The lead's integration notes (13:49) record the outcome: painted cut-out puppet for heroes, painted puppet + procedural VFX for bosses, enemies, NPCs and companions. Ends with GATE:ART-DECISION. Take-overs: FEEL-BOSSHOOKS (W1) takes boss.js, a_common.js, b_common.js, bosses/index.js and render/enemies.js (rebasing on the painted hooks already there); PLAT-SAVE-ASSETS (W1) takes assets.js (keeps the puppet loader); ART-KIT (W1) takes the painted runtime, the shared tools/painted and tools/puppet scripts and docs/art; ART-HERO-A (W2) takes hero.js, hero_parts.js, hero_puppet.js; ART-BOSS-2 takes a_bonedragon.js and the Bone Dragon painted files; ART-ENEMY-1 takes the 5 reference enemies (polish only). |
| EXT-CUTIN-ART | done (commit d0347c9, 14:29 UTC; integration notes) | assets/cg/cutin_*.webp; tools/kling/cutin_manifest.json; tools/kling/cutin_process.py; tools/kling/cutin_anchors.json | feel.md WP7. Acceptance: six webp files at most 250 KB each, no watermark (visual review), face/eye anchors in cutin_anchors.json (AWAKEN-CORE copies them into data/awaken.js). |
| EXT-P2-KLING | done (commit d0347c9, 14:29 UTC; integration notes) | assets/bg/s14_mirror.webp … s20_void.webp, assets/bg/worldmap2.webp; assets/tex/tex_mirror\|tex_forge\|tex_coral\|tex_sky_marble\|tex_nightmare\|tex_rotwood\|tex_void.webp; assets/portraits/b_narkissa\|b_narkissa2\|b_moloch\|b_dagon\|b_ziz\|b_mara\|b_behemoth\|b_nihil\|b_nihil2\|npc_rook2.webp; assets/cg/cg_rift_sky … cg_p2_true.webp (world2 §13.1 list); tools/kling/manifest_p2.json | world2 WP-H1. Acceptance: world2 §13.1 size budgets (bg at most 180 KB, cg at most 170 KB, portrait at most 90 KB, texture at most 60 KB, Part 2 total at most 6 MB), watermark crop verified. |
| EXT-P2-BLENDER | observed in flight | tools/blender/build_p2.py; assets/icons/<Part 2 ids>.png (whip_7 … amulet_7, wheart_1…6, star_shard, rift_lantern, dawnflower); assets/props/<Part 2 ids>.png (21 deco_* + prop_mirror_switch + prop_spore_pod) | world2 WP-H2. |
| EXT-CMP-ART | done (commit d0347c9, 14:29 UTC; integration notes) | assets/portraits/cmp_*.webp; assets/portraits/npc_greta.webp; tools/kling/manifest_companions.json; tools/kling/icon_focus.json | companions C9 (portraits only; the SFX half is AUDIO-CMP). File names keep the producer's names: cmp_m_* and cmp_g_* for Part 1 companions, cmp_mt_*/cmp_gd_* for Part 2. data/companions.js maps each id to its portrait path (no asset renames). |
| EXT-MUSIC-P2 | observed in flight (src/data/music.js +422 lines) | src/data/music.js | world2 WP-I: 11 tracks s14…s20, boss3, boss4, nihil, worldmap2. Acceptance: every id compiles (tools/gallery_audio.html smoke), loudness within ±10% of s13/chaos. |

### 0.3 Gates

| gate | meaning | blocks |
|---|---|---|
| GATE:ART-DECISION | The lead confirms the art approach. The integration notes already record 'painted' for heroes (cut-out puppet, 8 painted turntable directions per class) and for bosses, enemies, NPCs and companions (painted puppet + procedural VFX from the vector kit). The gate opens when the lead confirms that (or switches to 'vector_hd') and the bake-off runtime (kit.js, registry.js, enemy_kit.js, hero_puppet.js) and docs/art/*_PIPELINE.md are in the tree. Every art package is written so either outcome works, and the painted ownership paths follow the real layout (§1.15). | ART-KIT, ART-ENEMY-SPLIT and every art package that depends on them. Part 2 gameplay does not wait: FEEL-BOSSHOOKS (after the bake-off, not after the gate) owns the C/D registry merges in bosses/index.js and render/enemies.js. |
| GATE:QA-DRY | One complete W4 regression round finished with zero S1-S3 defects and no source edit landed after that round started (the loop in §5.3). | every W5 audit package (AUDIT-*) |
| GATE:AUDIT-CLEAN | The pre-release audit (W5) is triaged; every 치명적 and 높음 finding is fixed through the W4 fix buckets and re-verified; one more full W4 regression round after those fixes is dry. | every W6 delivery package (DELIVER-WEB, DELIVER-APK, DELIVER-ARTIFACT, DELIVER-HANDOFF, AUDIT-REPORT, QA-SIGNOFF) |

---

## 1. Cross-spec reconciliation: final decisions

### 1.1 Which spec wins

| topic | winning source | exception |
|---|---|---|
| Part 2 ids, numbers and Korean strings | world2.md | except the renames in the rename table (companion portrait paths, d21 command) |
| Companion mechanics, UI, save sub-tree, SFX recipes | companions.md | ids use the unified mt_/gd_ scheme; two Korean names change (rename table) |
| Movement and hit feel, ultimates, awakening | feel.md | the dedicated 'awaken' key moves from G/L3 to V/(none): G and L3 belong to companions |
| Input devices, touch pad, settings schema, menus, delivery | platform.md | touch buttons for mount/guard are drawn by touchpad.js (no DOM buttons, overrides companions §6) |
| HUD placement | this plan §1.8 | hud_layout.js is the single source; spec pixel positions are defaults only |
| File ownership and wave order | this plan | every spec's own WP table is superseded by the waves below |
| Art approach and painted file layout | the lead's integration notes (ART DECISION) and the bake-off runtime in the tree | approach stays TBD until GATE:ART-DECISION confirms; ownership in this plan covers both outcomes |
| Command input semantics (f/b) | this plan §1.21 | f/b are evaluated against the facing at the first direction of the sequence |

### 1.2 Companion roster (20 companions) and rename table

The world2 spec fixes six Part 2 companions (`gd_mirra`, `mt_ignis`, `gd_lumen`, `mt_gale`, `gd_momo`, `mt_silva`). The companions spec defines six mounts and eight guardians with `m_`/`g_` ids. All 20 now use one id scheme: `mt_` for mounts and `gd_` for guardians.

**Mounts (9)**

| id | name | title | how obtained | chapter | rig | portrait | cry |
|---|---|---|---|---|---|---|---|
| mt_warhorse | 그림메인 | 흑철 군마 | flag stable_open (script cmp_stable_open, first hub visit with chapter ≥ 1) | 1 | horse | portraits/cmp_m_warhorse | neigh |
| mt_boar | 바르그 | 철엄니 멧돼지 | shop 6,000 G (chapter ≥ 2) | 2 | boar | portraits/cmp_m_boar | boar_grunt |
| mt_skelsteed | 코슈타 | 망령 해골마 | boss b_dullahan (first kill, story mode) | 3 | horse | portraits/cmp_m_skelsteed | neigh ×0.8 + bone_rattle |
| mt_direwolf | 스콜 | 서리 늑대 | quest cq_skoll (Greta) | 4 | wolf | portraits/cmp_m_direwolf | wolf_howl |
| mt_wyvern | 스칼렛 | 진홍 와이번 | egg from b_chimera, hatchAfter 2 | 7-8 | wyvern | portraits/cmp_m_wyvern | roar_small |
| mt_giantbat | 녹티스 | 거대 박쥐 | relics ≥ 5 (plays cmp_bat_arrive) | ≈11 | bat | portraits/cmp_m_giantbat | screech |
| mt_ignis | 이그니스 | 화염 군마 | flag recruit_mt_ignis (s15_outro {cmd:'recruit'}) | 15 | horse (fire variant) | portraits/cmp_mt_ignis | neigh ×0.9 + fire |
| mt_gale | 게일 | 폭풍 그리핀 | flag recruit_mt_gale (s17_outro) | 17 | griffin (new: wolf legs + wyvern wings) | portraits/cmp_mt_gale | griffin_cry |
| mt_silva | 실바 | 백록 신령 | flag recruit_mt_silva (s19_outro) | 19 | stag (horse variant with antlers) | portraits/cmp_mt_silva | stag_call |

**Guardians (11)**

| id | name | title | how obtained | chapter | portrait | cry |
|---|---|---|---|---|---|---|
| gd_fairy | 아리아 | 빛의 요정 | boss b_banshee | 2 | portraits/cmp_g_fairy | fairy_chime |
| gd_spiritwolf | 하티 | 영혼 늑대 | quest cq_hati (Greta) | 2+ | portraits/cmp_g_spiritwolf | wolf_howl ×1.3 |
| gd_imp | 핌 | 소악마 마법사 | shop 「소악마 계약서」 7,500 G (chapter ≥ 3) | 3 | portraits/cmp_g_imp | imp_cackle |
| gd_knight | 가웨인 | 망령 기사 | boss b_crimson | 4 | portraits/cmp_g_knight | knight_guard |
| gd_whelp | 크론 | 새끼 본 드래곤 | egg from b_bonedragon, hatchAfter 2 | 5-6 | portraits/cmp_g_whelp | roar_small ×1.6 + bone_rattle |
| gd_owl | 미네르바 | 성스러운 올빼미 | boss b_grimoire | 6 | portraits/cmp_g_owl | owl_hoot |
| gd_clock | 틱톡 | 태엽 인형 | boss b_colossus | 9 | portraits/cmp_g_clock | gear_whir |
| gd_reaper | 모르스 | 꼬마 사신 | boss b_death | 11 | portraits/cmp_g_reaper | scythe |
| gd_mirra | 미라 | 거울 요정 | flag recruit_gd_mirra (s14_outro) | 14 | portraits/cmp_gd_mirra | mirror_chime |
| gd_lumen | 루멘 | 등불 해파리 | flag recruit_gd_lumen (s16_outro) | 16 | portraits/cmp_gd_lumen | jelly_zap |
| gd_momo | 모모 | 꿈먹는 맥 | flag recruit_gd_momo (s18_outro) | 18 | portraits/cmp_gd_momo | momo_gulp |

**Rename and override table**

| kind | from | to | why |
|---|---|---|---|
| id | m_warhorse, m_boar, m_skelsteed, m_direwolf, m_wyvern, m_giantbat | mt_warhorse, mt_boar, mt_skelsteed, mt_direwolf, mt_wyvern, mt_giantbat | One prefix scheme for all 20 companions (world2's mt_/gd_). The m_ prefix already means 'material' in ITEMS (m_stone_1, m_mirror). |
| id | g_fairy, g_spiritwolf, g_imp, g_knight, g_whelp, g_owl, g_clock, g_reaper | gd_fairy, gd_spiritwolf, gd_imp, gd_knight, gd_whelp, gd_owl, gd_clock, gd_reaper | Same scheme. |
| Korean name | m_wyvern 「이그니스」 | mt_wyvern 「스칼렛」 | world2 fixes 이그니스 for the Part 2 flaming warhorse mt_ignis (credits text). Update the wyvern join narration: '스칼렛: 연구소의 알에서 태어난 진홍의 비룡. 태어나 처음 본 당신을 어미로 여긴다.' |
| Korean name | g_fairy 「루미」 | gd_fairy 「아리아」 | Too close to 루멘 (gd_lumen) and 성녀 루미나. Update toasts/lines that name her (e.g. '「아리아」와의 유대가 깊어졌다 — 공명'). |
| portrait path | companions §11.5 portraits/cmp_<id>; world2 §1.2 portraits/<id> | explicit `portrait` field per companion (table above) | Keeps the files EXT-CMP-ART already produced; world2 scripts use portrait:'portraits/cmp_gd_mirra' etc. |
| action binding | feel §2.1 awaken = keyboard G, pad L3 | awaken = keyboard V, pad unbound (remappable); hold ult 0.45 s on every device | G = guard and L3 = mount (companions §6). |
| bus event | platform §4.6 'ultStart' | 'ultimateCast' {charId, tier, classId} | companions §12.5 already defines ultimateCast; one name. |
| touch buttons | companions §6 DOM buttons .b.mnt/.b.grd in index.html | canvas buttons 'mount'/'guard' in src/core/touchpad.js | platform §5.2 replaces the DOM pad. |
| command | world2 d21 tech_mirror cmd ['b','b','btn:attack'] | ['d','uf','btn:attack'] (↓↗+공격) | The first back press turns the hero, so the second reads as forward: [b,b] is unreachable and collides with 수룡참 (→→) and sprint double-tap. See §1.21. |
| manifest | world2/companions 'append to tools/kling/manifest.json' | tools/kling/manifest_<pkg>.json per package | Concurrent JSON appends are unsafe (R11). |
| STAGE_ORDER | world2 §4.2 STAGE_ORDER = [...P1, ...P2] | STAGE_ORDER = [...STAGE_ORDER_P1, ...STAGE_ORDER_P2] where P2 is filtered to stages present in STAGES | Keeps every consumer working while maps land one group at a time. |
| Node version | platform §9.2 NODE_VERSION 20 | NODE_VERSION 22 | @netlify/blobs 11 (accounts) needs Node 22.12+. |

**Roster rules**

- Loadout per hero: 1 mount + 1 guardian; a 2nd guardian slot opens at progress.chapter ≥ 8 (companions §2.5).
- Part 2 companions use obtain type 'flag' with flag 'recruit_<id>'. The story command {cmd:'recruit', id} sets the flag and calls game.companions?.recruit?.(id); evaluateUnlocks grants any flagged-but-missing companion on load (world2 §2.4, §14).
- game.companions = { recruit(id), unlock(id, opts) } is bound by initCompanions (companion_events.js, CMP-DATA).
- Catch-up start level clamp(round(maxHeroLevel×0.7), 1, 25) applies to Part 2 companions too (they join at 25).
- Homonym accepted: gd_mirra 「미라」 equals the Korean name of the s05 enemy mummy 「미라」. The companion UI always shows the title (거울 요정 미라); story text stays verbatim.
- Namespaces: quest id mt_feast (Marta) and companion ids mt_* never meet (quests vs companions tables); keep both.
- Gimmick interplay: mounts auto-dismount on entering 'deep' water and cannot be summoned under water; wind force × (p.mount?.riding ? p.mount.def.windMul ?? 1 : 1); blight gain × (p.mount?.riding ? p.mount.def.blightMul ?? 1 : 1); deep air drain × (world.companions?.airDrainMul ?? 1); guardians are never solid and are ignored by mirror/heartbeat overlap tests; guardian attacks do not hit MirrorSwitch/SporePod.
- b_nihil_final lists one line per recruited Part 2 companion (conditional on recruit_<id>).
- Part 2 companion numbers in the two tables below are this plan's defaults; CMP-DATA may tune ±20% to meet the §9 share limits, extended with check points (30, 60) and (30, 68).

**Part 2 mounts: default numbers** (Lv 1, same columns as companions §3.4 and §3.9)

| id | body | seat | footY | speed | accel / decel / air | jump / airJumps | flight | charge (dash) | special (↓+attack) | ride bonus | passive | hp / absorb / taken / armor / recall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mt_ignis | 60×90 | −4, −56 | 26 | 430 | 1700 / 2100 / 1300 | 820 / 0 | — | 「화염 돌진」 dur 0.38, 820 px/s, mv 1.3 fire, kb [440,−280], launch, cd 0.8, iframes 0.2, ember trail Hitbox 1.0 s (mv 0.3 fire, rehit 0.25) | 「업화 발굽」 rear-up 0.3 s (invuln) → stomp + 3 fire pillars each side at 70/140/210 px (44×150, mv 0.9 fire), cd 5 | fire +20, resFire +20 | lava contact damage ×0.5; ember hoofprints | 0.95 / 0.70 / 1.00 / 0.12 / 18 |
| mt_gale | 64×86 | −6, −54 | 22 | 400 ground / 440 air | 2200 / 2200 / 2000 | 840 / 1 | glide {flaps 2, flapVy −600, glideFall 140, glideSpeed 440} | 「질풍 돌격」 8-way from (ax, ay) like the giant bat, dur 0.30, 880 px/s, mv 1.1 thunder, stun 0.3, cd 0.8, iframes 0.2 | 「뇌명 급강하」 air: dive; ground: leap vy −700 then dive → landing shock r 140 (mv 1.3 thunder) + lightning columns at ±120/±240 (mv 0.8), cd 6 | thunder +15, jumpPow +8 | def.windMul = 0.5 (gusts push the rider half as much; updrafts unchanged) | 0.80 / 0.65 / 1.05 / 0.08 / 20 |
| mt_silva | 58×88 | −4, −54 | 24 | 440 | 2000 / 2200 / 1500 | 900 / 1 (bound) | — | 「뿔 돌격」 dur 0.32, 840 px/s, mv 1.2 holy, stun 0.6, kb [360,−320], cd 0.7, iframes 0.2 | 「정화의 울음」 ring r 240 (mv 0.9 holy, stun 0.8) + world.gimmickOf?.('blight')?.cleanse(40) + rider heal 5% max HP, cd 8 | holy +15, hpRegen +1 | def.blightMul = 0.5 (blight meter gain halved); poison liquid immune | 0.85 / 0.65 / 1.00 / 0.10 / 16 |

**Part 2 guardians: default numbers** (Lv 1, same columns as companions §4.9)

| id | move · size · z | anchor dx, dy | auto attack | skill (guard) | assist | aura base (+perLv) | passive | light | skill line | join line |
|---|---|---|---|---|---|---|---|---|---|---|
| gd_mirra | fly · 20×30 · front | 32, −100 | 「거울 파편」 homing shard, speed 680, mv 0.55 ice, every 1.3 s, range 320 | 「만화경 난반사」 cd 30: 8 shards orbit the player 1.0 s, then fire at up to 8 enemies (mv 0.9 ice, pierce 1) | 「반사 일격」 mv 1.0 ice | crit 4 (+0.1), resIce 10 | every 5 s reflects one enemy projectile within 80 px back at its owner (team swap, mv 1.0; skips beams, unblockable, size > 80 px) | #dff4ff r90 i0.5 | 거울아, 거울아 — 저 괴물의 진짜 얼굴을 보여 줘! | 이제부터 당신의 뒤를 비출게요. 뒤에서 오는 건 제가 먼저 볼게요. (world2 s14_outro line) |
| gd_lumen | fly · 24×28 · front | 36, −104 | 「전기 촉수」 zap mv 0.5 thunder + 1 chain (70%), every 1.4 s, range 280 | 「심해의 등불」 cd 32: flash, non-boss enemies in view stunned 1.5 s + mv 1.2 thunder; deep gimmick air set to 100 | 「방전」 mv 0.9 thunder, stun 0.3 | mpRegen 1 (+0.03), resThunder 10 | extra light r 220 at the player; world.companions.airDrainMul = 0.5 while equipped | #6fe8ff r120 i0.6 | (삐릿— 삐리리릿!) | (서술) 빛나는 해파리가 등불 곁에 둥실 떠올랐다. 이제 어둠 속에서도 길을 밝혀 줄 것이다. |
| gd_momo | float · 30×24 · back | 44, −70 | 「꿈 삼키기」 trunk bite rect 50×40, mv 0.8 dark, every 1.3 s, range 300 | 「악몽 포식」 cd 36: swallows every enemy projectile on screen, pulls non-boss enemies 200 px for 1.0 s, then heals the player 10% max HP | 「코 휘두르기」 mv 1.0 dark | hpRegen 0.5 (+0.03), resDark 10 | every 6 s eats one enemy projectile within 120 px (fx.text '꺼억') | #c060ff r70 i0.4 | (우물우물… 꺼억!) | (서술) 꿈먹는 맥이 당신의 그림자 속으로 쏙 들어왔다. 악몽은 이제 이 녀석의 간식이다. |

### 1.3 Stub protocol (W0 SKEL)

Every module in this table exists after W0, with the listed exports as no-ops. The real owner replaces the whole file (rule R5). Stubs keep today's behavior.

| module | stub exports | real owner |
|---|---|---|
| src/data/feel_move.js | GAIT, CADENCE, PERSONALITY, SURFACE, DASH_FX, SPRINT, SKID, LAND = {} | FEEL-MOVE (W2) |
| src/game/feel_move.js | initFeel(p), updateGait(p,world,dt,inp)→null, onJump(), onLand(), dashFx(), squashSpring() | FEEL-MOVE (W2) |
| src/render/hero_gait.js | gaitPose(), applyFeelOverlay(), GAIT_ANIMS = {} | FEEL-MOVE (W2) |
| src/game/style.js | class Style {onHit, onEvent, onKill, onHurt, update, rank=0, pts=0} | FEEL-IMPACT (W1) |
| src/data/feel_hit.js | HITSTOP, HS_CAP, WEIGHT, JUGGLE, DOWN, BOUNCE, MATERIAL, DMG_STYLE, STYLE, AW_GAIN, RUMBLE, BUDGET = {} | FEEL-IMPACT (W1) |
| src/render/hitfx.js | glow(), star(), cut(), streak(), ring(), digitAtlas(), materialBurst(), stampDecal() no-ops | FEEL-REACT (W1) |
| src/render/feel_hud.js | drawComboHUD(), drawAnnouncer(), drawAwGauge() → false (hud.js keeps its legacy combo block while these return false) | FEEL-HUD (W2) |
| src/render/ultfx.js | ULTFX = {begin, beat, final, afterimage, end} no-ops, ULT_TIERS = {} | FX-ULTKIT (W2) |
| src/game/awaken.js | handleUltInput(p, world): legacy behavior (ult pressed and sp ≥ 100 → castUltimate, return true); canAwaken()→false; castAwakening(); registerDirector() | AWAKEN-CORE (W2) |
| src/game/awaken_directors.js | AWAKEN_DIRECTOR = {} | AWAKEN-DIR-A (W2) |
| src/game/awaken_directors_b.js | AWAKEN_DIRECTOR_B = {} | AWAKEN-DIR-B (W2) |
| src/data/awaken.js | AWAKEN = {} | AWAKEN-CORE (W2) |
| src/scenes/awaken_cutin.js | class AwakenCutinScene: enter(p) calls p.onDone?.() then pops | AWAKEN-CORE (W2) |
| src/core/prompts.js | bindingOf(), drawGlyph() (draws the legacy keycap text), drawHints(), legacyKey() | PLAT-INPUT (W1) |
| src/core/touchpad.js | initTouchPad()→null, touchpad = {setVisible(), openEditor(), closeEditor(), occupiedRects()→[], stickZone()→null} | PLAT-TOUCH (W1) |
| src/render/hud_layout.js | hudLayout(world, vw, vh) returning today's positions | HUD-LAYOUT (W1) |
| src/game/gimmicks.js | createGimmick()→null, GIMMICK_KINDS, class MirrorSwitch, export { SporePod } from './gimmicks_b.js' | GIMMICK-ENGINE (W1) |
| src/game/gimmicks_b.js | GIMMICKS_B = {}, class SporePod extends Entity {} | GIMMICK-KINDS-B (W1) |
| src/data/enemies_c.js, src/data/enemies_d.js | ENEMIES_C = {}, ENEMIES_D = {} | P2-DATA (W1) |
| src/game/ai_c.js, src/game/ai_d.js | AI_C = {}, AI_D = {} | ENEMY-P2-C-AI / ENEMY-P2-D-AI (W2) |
| src/render/enemies_c.js, src/render/enemies_d.js | RENDER_C = {}, PROJ_C = {}, ZONE_C = {}; RENDER_D = {}, PROJ_D = {}, ZONE_D = {} | ENEMY-P2-C-ART / ENEMY-P2-D-ART (W2) |
| src/data/bosses_c.js, src/data/bosses_d.js | BOSSES_C = {}, BOSSES_D = {} | P2-DATA (W1) |
| src/game/bosses/c_narkissa.js, c_moloch.js, c_dagon.js, c_ziz.js, d_mara.js, d_behemoth.js, d_nihil.js | export const <Class> = null | BOSS-P2-1…4 (W2) |
| src/game/bosses/bosses_c.js, src/game/bosses/bosses_d.js | FINAL (not a stub): registries that import the seven class files and drop null entries | SKEL (permanent; W4 FIX-AI-BOSS) |
| src/data/story_p2.js | SCRIPTS_P2 = { ...SCRIPTS_P2B }, CREDITS_P2 = [] (imports story_p2b.js) | STORY-P2-A (W2) |
| src/data/story_p2b.js | SCRIPTS_P2B = {} | STORY-P2-B (W2) |
| src/game/skills_p2.js | SKILL_IMPL_P2 = {}, TECH_NAMES_P2 = {} | ITEMS-P2 (W2) |
| src/data/companions.js | MOUNTS = {}, GUARDIANS = {}, MOUNT_IDS = [], GUARDIAN_IDS = [], COMPANION_ORDER = [], companionDef()→null | CMP-DATA (W1) |
| src/game/companion_state.js | ensureCompanionState(), migrateCompanions() and the rest of companions §12.2 as no-ops | CMP-DATA (W1) |
| src/game/companion_events.js | initCompanions(game), applyCompanionDebug() no-ops | CMP-DATA (W1) |
| src/game/companions.js | class CompanionSystem (every §12.4 method no-op, incoming()→null, shieldT 0, hudInfo()→null, airDrainMul 1), companionHubEnter(), companionHubNote()→null | CMP-SYS (W2) |
| src/game/guardian_ai_b.js | GUARDIAN_AI_B = {} | CMP-GUARD-AI-B (W2) |
| src/game/mount.js | class MountRider {riding=false}, class MountGhost, DISMOUNT_SKILLS = [], fits(), findMountSpot() | CMP-MOUNT (W2) |
| src/render/mount_rig.js, src/render/mounts.js, src/render/mounts_b.js | mountPose(), seatOf(); drawMount(), drawMountIcon(); MOUNT_DRAW_B = {} | CMP-MOUNT-ART-A / -B (W2) |
| src/render/guardians.js, src/render/guardians_b.js | drawGuardian(), drawGuardianIcon(), FX helpers; GUARDIAN_DRAW_B = {} | CMP-GUARD-ART-A / -B (W2) |
| src/render/companion_hud.js | drawCompanionHUD()→null, drawCompanionIcon() | CMP-UI (W2) |
| src/scenes/menu/tab_companions.js | class CompanionsTab extends Tab (renders '준비 중') | CMP-UI (W2) |
| src/scenes/companion_join.js | class CompanionJoinScene: calls onDone and pops | CMP-UI (W2) |
| src/scenes/town/stable.js | class StableScene: pops immediately | CMP-TOWN (W2) |
| src/data/story_companions.js | COMPANION_SCRIPTS = {} | CMP-TOWN (W2) |
| src/core/audio_companions.js | (empty module) | AUDIO-CMP (W2) |
| src/core/platform.js | safeInsets()→{l:0,r:0,t:0,b:0}, initPlatform(game), onUpdateReady(cb) no-op, isStandalone()→false | PLAT-BOOT (W1) |
| src/game/mount_b.js | MOUNT_B = {} (Part 2 mount charge/special/passive registry read by mount.js) | CMP-MOUNT-B (W2) |
| src/game/skills.js (existing file) | placeholder `export const FXKIT = {};` so AWAKEN-CORE can import it before FX-ULTS fills it (R6) | FX-ULTS (W2) |

### 1.4 Input: actions, default bindings, sprint, awakening, companions

**New or changed actions** (the existing set stays: `left right up down jump attack dash sub skill1 skill2 ult swap menu confirm cancel map`)

| action | Korean | meaning | spec |
|---|---|---|---|
| awaken | 각성기 | instant awakening when ready; otherwise behaves as an 'ult' press | feel §6.1 |
| mount | 탈것 소환/하차 | toggle mount (gameplay only) | companions §6 |
| guard | 수호신 스킬 | first ready guardian casts its skill (gameplay only; ignored in town) | companions §6 |
| viewL / viewR | 영웅 회전 | turntable rotate in menus | platform §3 |
| viewReset | 회전 초기화·자동 회전 | turntable auto-spin toggle / reset in menus | platform §3 |
| map (repurposed) | 빠른 메뉴 · 지도 전환 | stage/hub: open menu on the inventory tab; worldmap: switch page | platform §3, world2 §10 |

**Default bindings** (pad positions use the standard mapping; ✕○□△ = PlayStation glyphs, drawn from `input.padInfo.glyphs`)

| action | keyboard | pad: arcade preset (default) | pad: classic preset | touch |
|---|---|---|---|---|
| left/right/up/down | arrows (+ W = up) | D-pad, left stick (radial dz 0.20, 8-way sectors; analog tilt < 0.55 = walk) | same | floating stick (left 45%); tilt < 55% radius = walk |
| jump | Z, Space | A/✕ (0) | A/✕ (0) | jump button (swims in deep water) |
| attack | X, J (hold = charge) | X/□ (2) (hold = charge) | B/○ (1), X/□ (2) | attack button (hold = charge) |
| dash | C, Shift, K | B/○ (1) | LT (6) | dash button |
| sub | A | Y/△ (3) | Y/△ (3) | sub button |
| skill1 / skill2 | S / D | LB (4) / RB (5) | LB / RB | skill buttons (icons, cooldown sweep) |
| swap (skill page) | Q, E | LT (6), value ≥ 0.5 | SELECT (8) | swap button (44 px, 1/2 · 2/2) |
| ult | F (tap = ult; hold 0.45 s = awakening when ready) | RT (7), value ≥ 0.5 (hold = awakening) | RT (7) | ult button (tap = ult; hold = awakening, ring feedback) |
| awaken | V (falls back to ult when not ready) | unbound (remappable) | unbound | — (hold ult) |
| mount | R | L3 (10) — accepted only while the left stick is inside 0.6, or when L3 is held ≥ 0.25 s (no accidental clicks while running) | same | 탑승/하차 button (shown only with a mount equipped) |
| guard | G | R3 (11) | R3 (11) | 수호 button (shown only with a guardian equipped) |
| map | Tab, M, I | SELECT (8) | unbound (pause → 인벤토리) | 가방 button (top centre) |
| menu (pause) | Enter, Escape | START (9) | START (9) | Ⅱ button (top centre) |
| confirm / cancel (menus) | Z, Space, Enter / X, Escape, Backspace | S/E by ctrlConfirm ('auto': Nintendo = east confirm) | same | tap / back button |
| prevTab / nextTab (menus) | Q, S / E, D (Q and E stay distinct in menus) | LB (4) / RB (5) | LB / RB | swipe, tab arrows |
| viewL / viewR / viewReset (menus) | Comma / Period / Slash | right stick X / R3 (11) | same | drag, ⟲ ⟳ buttons, double-tap |
| sprint | double-tap ←/→ within 0.24 s, or dash-chain | double-tap stick/D-pad, or dash-chain | same | push the stick past 1.15× radius (re-anchor only past 1.4×), or double-tap |

**Touch layout** (size class S, CSS px from the safe-area bottom-right corner; the pause Ⅱ and quick-menu 가방 buttons are 44×44 at the top centre)

| button | right | bottom | diameter |
|---|---|---|---|
| attack | 108 | 58 | 72 |
| jump | 36 | 118 | 68 |
| dash | 190 | 44 | 56 |
| sub | 118 | 146 | 54 |
| skill1 | 190 | 122 | 54 |
| skill2 | 50 | 200 | 54 |
| ult | 262 | 96 | 58 |
| swap | 128 | 214 | 44 |
| mount | 262 | 176 | 48 |
| guard | 196 | 200 | 48 |

**Rules**

- input.mode ∈ {'kb','pad','touch'} is the last meaningful device (platform §3); input.touchMode stays as a read-only alias (mode === 'touch') for the 54 legacy call sites.
- The touch pad shows only when input.mode === 'touch' (game.syncPad is the only visibility owner). mount/guard buttons appear from world.companions.hudInfo(); the ult ring reads world.awakenState {ready, holdK}.
- The minimum circle gap in the touch layout above is 19.2 px (attack–dash; platform §5.2 layout, unchanged); the two companion buttons keep ≥ 22 px to every neighbour. Acceptance (platform WP-2): gap ≥ 12 px and every button ≥ 44 CSS px. Hit radii = visual + 10 px slop, nearest centre wins.
- Awakening trigger (feel §6.1): when both gauges are full, a tap under 0.20 s fires the normal ult on release, 0.20–0.45 s cancels, ≥ 0.45 s awakens; when not ready, ult fires on press (no latency). 'awaken' fires instantly when ready.
- Double-tap sprint uses input.releasedAt(action) (new, PLAT-INPUT). →→ followed by attack within 0.25 s of the second press casts 수룡참 (d14) when learned and MP suffices; an attack pressed later while still sprinting is always the sprint dash attack, so learning d14 never removes the DNF dash attack. Command techniques are checked before the sprint dash attack (window 0.6 s; 0.8 s on touch).
- Menus resolve semantics (confirm, cancel, prevTab, nextTab, alt, alt2, swap) from input.bindings per device, not from gameplay action names, so B = dash never also cancels.
- Remappable (Options › 조작): jump, attack, dash, sub, skill1, skill2, swap, ult, awaken, map, mount, guard. Not remappable: menu/START/Escape, movement, menu confirm/cancel.
- Touch technique radial (platform §5.5 P2) is optional and opens by a 350 ms long-press on the swap button; in touch mode swap therefore fires on release when the press was shorter than 350 ms (the touch pad delays the action). Never on attack (attack hold = charge).
- Rumble: every rumble call goes through input.rumble(strong, weak, ms) → haptics (§1.11).
- Hitstop-safe input (R16). world.update() returns before the entity loop while world.hitstop > 0 (S class 0.25 s, A class 0.40 s) but input.update() keeps stepping, so a pressed/released edge inside a freeze is never seen by the player. The awakening hold (tap < 0.20 s, cancel 0.20–0.45 s, awaken ≥ 0.45 s), the touch swap tap/long-press, double-tap sprint and the L3 guard use level state (input.down) plus timestamps (input.pressTime, input.releasedAt, both recorded inside input.update for every action). handleUltInput cancels an active hold when it was not called on the previous player update (hurt, cutscene, inputLock or dead early returns) and when a scene is pushed (input.flush).
- Command facing (existing bug found in review). input.command() maps f/b with the facing at the moment attack is pressed, but Player.update turns the hero as soon as a back direction is held, so any motion that ends facing the other way is unreachable from a standstill today: d05 선풍각 ↓↙←, d19 그랜드 크로스 →↓←↑ and world2's original d21 [b,b]. Fix in W1: GAME-HOOKS keeps a 1 s ring of facing changes (p.facingAt(t)); PLAT-INPUT changes the signature to input.command(seq, facingAt, within) → {ok, facing}, evaluating f/b against the facing when the first direction of the sequence was entered; castTechnique fires toward that facing (the hero turns back first).
- Menus keep Q and E distinct: prevTab = Q, S, LB; nextTab = E, D, RB (resolved from key codes and pad indices in input.bindings), although both Q and E are bound to the gameplay action swap. tools/integration.mjs's menu case (KeyE) must keep passing.
- Touch pad geometry is shared: touchpad.occupiedRects() returns every visible button rect plus the Ⅱ/가방 pair in logical px for the current viewport; HUD-LAYOUT uses it for the touch matrix (§1.8) and world.stickRect() uses touchpad.stickZone() for clearStickAtSpawn instead of the removed DOM #stick. Scenes hide buttons with the flag padHideButtons (array of ids; the hub sets its NO_COMBAT list incl. guard). The legacy DOM helpers (front/common.setPad and applySettings --touch-op, menu/common.hidePad, games/common.padPush/padPop/padHide, hub.townPad, world.stickRect) find no #touch after PLAT-TOUCH and silently no-op until their W1/W2 owners migrate them; the canvas pad reads settings.touchOpacity itself.
- Binding collision check (tools/qa/bindings.mjs, QA-TOOLS): in each preset no key code or pad index maps to two gameplay actions except the documented dual uses (Z/Space jump+confirm, X attack+cancel, Enter menu+confirm, Escape menu+cancel, Q/E swap vs menu tabs, LB/RB skills vs menu tabs, R3 guard vs menu viewReset); the touch layout keeps gaps ≥ 12 px and buttons ≥ 44 CSS px at every size class and touchScale 0.8–1.3.

### 1.5 Settings keys (`DEFAULT_SETTINGS`, one owner)

| key | default | values | source | options page | row label |
|---|---|---|---|---|---|
| settingsVersion | 2 | 2 | platform §10 | — | — |
| musicVol | 0.6 | 0..1 | existing | 소리 | 배경 음악 |
| sfxVol | 0.8 | 0..1 | existing | 소리 | 효과음 |
| musicSource | 'recorded' | 'recorded'\|'synth' | recorded music (src/core/audio_rec.js); default 'synth' when Save-Data is on or the start tier is low (the tier that puts the web build on its lo/ stage) | 소리 | 음악 음원 |
| quality | 'auto' | 'auto'\|'low'\|'medium'\|'high' | platform §6.4 (was detectQuality()) | 화면 | 그래픽 품질 |
| fpsCap | 60 | 60 \| 0 | platform §6.5 | 화면 | 프레임 제한 |
| uiScale | 'auto' | 'auto' \| 1 \| 1.15 \| 1.3 \| 1.5 | platform §6.2 | 화면 | 글자·UI 크기 |
| safeArea | 'fit' | 'fit'\|'full' | platform §6.1 | 화면 | 노치 영역 |
| screenShake | 1 | 0..1 | existing (also scales kick/trauma, feel §7) | 화면 | 화면 흔들림 |
| showDamage | true | bool | existing (hides numbers and callouts, not the announcer) | 화면 | 데미지 숫자 |
| flashFx | 1 | 0 \| 0.5 \| 1 | feel §7 | 화면 | 화면 번쩍임 |
| cutinMode | 'full' | 'full'\|'short' | feel §7 | 화면 | 각성 컷인 |
| reduceMotion | false | bool | platform §10 | 화면 | 동작 줄이기 |
| ctrlPrompts | 'auto' | 'auto'\|'keyboard'\|'xbox'\|'ps'\|'nintendo' | platform §4.1 | 조작 | 버튼 안내 아이콘 |
| ctrlPreset | 'arcade' | 'arcade'\|'classic'\|'custom' | platform §4.2 | 조작 | 컨트롤러 배치 |
| ctrlConfirm | 'auto' | 'auto'\|'south'\|'east' | platform §4.2 | 조작 | 결정 버튼 위치 |
| ctrlMap | null | {action:[btnIndex…]} | platform §4.7 | 조작 | 컨트롤러 버튼 지정 › |
| keyMap | null | {action:[code…]} | platform §4.7 | 조작 | 키보드 키 지정 › |
| ctrlDeadzone | 0.2 | 0.1..0.4 | platform §4.3 | 조작 | 스틱 데드존 |
| ctrlRumble | 0.8 | 0..1 | platform §4.6 | 조작 | 컨트롤러 진동 세기 |
| autoSprint | false | bool | feel §7 | 조작 | 자동 달리기 |
| touchOpacity | 0.55 | 0..1 | existing | 터치 | 투명도 |
| touchScale | 1 | 0.8..1.3 | platform §5.2 | 터치 | 크기 |
| touchStick | 'float' | 'float'\|'fixed' | platform §5.2 | 터치 | 스틱 방식 |
| touchSlide | true | bool | platform §5.2 | 터치 | 버튼 사이 밀어 누르기 |
| touchLeftHanded | false | bool | platform §5.2 | 터치 | 왼손 모드 |
| touchLayout | null | {id:{right,bottom,d}} | platform §5.3 | 터치 | 버튼 배치 편집 › |
| vibration | true | bool | existing (phone vibrate) | 터치 | 진동 |
| autoSave | true | bool | existing | 기타 | 자동 저장 |
| keepAwake | true | bool | platform §6.6 | 기타 | 화면 꺼짐 방지 |
| turntableAuto | true | bool | platform §7.2 | 기타 | 영웅 자동 회전 |
| fullscreenAuto | true | bool | platform §6.6 (touch/Android web only) | 기타 | 첫 터치에 전체 화면 |
| telemetry | true | bool | docs/TELEMETRY.md (default false when navigator.globalPrivacyControl) | 기타 | 익명 통계·오류 보내기 |
| language | 'ko' | 'ko' | existing | — | — |

- Owner: src/core/save.js DEFAULT_SETTINGS + saves.loadSettings() (PLAT-SAVE-ASSETS, W1). All keys land in one edit.
- Migration: no settingsVersion (v1) → quality resets to 'auto' (v1 values came from detectQuality(), not from the player); unknown keys are kept; out-of-range values fall back to defaults; settingsVersion = 2.
- Companions add no settings key: auto-skill lives per save in state.companions.autoSkill (null = device default: on in touch mode). World2 adds none.
- Options pages (PLAT-OPTIONS): 소리 · 화면 · 조작 · 터치 · 기타, rows as in the table, plus 조작 안내 › generated from input.bindings (includes 탈것 [R/L3], 수호신 [G/R3], 각성기 [F 길게 / V · RT 길게]) and the 전체 화면 toggle action on 화면. Each row's ◀▶ targets are ≥ 44 CSS px after UI scale.
- settings.painted (read by src/render/painted/registry.js) is a debug kill switch, not a DEFAULT_SETTINGS key and not an Options row: undefined = on; ?painted=0 and window.__paintedOff also turn painted art off.

### 1.6 Save schema v2 and the migration owner

| field | value | source |
|---|---|---|
| state.version | 2 (SAVE_VERSION = 2) | world2 §2.6 |
| state.progress.shards | string[] of k_star_1…6 (recorded by world.collect) | world2 §2.6, §3.9 |
| state.progress.hearts | string[] of k_heart_1…6 | world2 §2.6, §3.9 |
| state.progress.chapter | now reaches 20 | world2 §2.1 |
| state.progress.flags | + p2_started, rook_revealed, hearts_all, stars_all, p2_star, p2_done, s14_revealed, s20_revealed, dawnflower_given, recruit_<6 ids>, ending_p2, ending_p2true, stable_open (and script flags) | world2 §2.5, companions §13 |
| state.companions | { v:1, owned, eggs, pending, clears, autoSkill, slot2Seen, last } (companions §8; ids per §1.2) | companions §8 |
| state.heroes[id].companions | { mount: id\|null, guards: [id\|null, id\|null] } | companions §8 |
| meta.tips | optional object of one-time tips seen: { a2hs, storage, remap, pad } (platform §6.6/§9.3) | platform |
| (runtime only) world.run.aw | awakening gauge 0..100, reset at stage start, kept across rooms and respawns, never saved | feel §6.1 |
| (runtime only) world.run.mount | { hp:{id:n}, cd, state } per stage run, never saved | companions §8 |
| (runtime only) world.awakenState | { ready, holdK } for HUD/touch pad | this plan |

- One migration owner: migrateState(s) in src/game/state.js (GAME-HOOKS in W1; FIX-ENGINE in W4). Order: existing normalization → add 'shards','hearts' to the array-field list and drop non-string ids → migrateCompanions(s) (companion_state.js, wrapped in try/catch, resets state.companions on corruption) → s.version = SAVE_VERSION. Idempotent (running it twice gives a deep-equal result).
- newGameState(): progress.shards = [], progress.hearts = [], ensureCompanionState(state). Arcade temp states get the arrays through newGameState; companions stay inactive in arcade modes.
- isValidSave() is unchanged on the client and in netlify/lib/validate.mts (companions and the new arrays are optional). Cloud downloads go through migrateState after download (docs/ACCOUNTS.md). Export/import codes carry state.companions automatically.
- No awakening field is persisted: the gauge lives in world.run.aw for one stage run, and cutinMode is a global setting.
- Fixtures: tools/fixtures/save_v1.json (Part-1-complete v1 save without shards/hearts/companions; GAME-HOOKS) and tools/fixtures/save_ch6_nocmp.json (companions §14 C10 scenario 2; CMP-DATA).
- Size: a chapter-20 save with every companion, full tier-7 gear and a full inventory must serialize under 256 KB (the accounts server rejects saves over 512 KB: netlify/lib/config.mts BODY_LIMIT.save); tools/test_save_v2.mjs asserts it.
- Downgrade safety: migrateState never drops unknown fields (an older cached client or APK may load a v2 save and must keep companions/shards/hearts); isValidSave stays version-agnostic.

### 1.7 Hook points and their order

Every hook line carries its tag (rule R4). GAME-HOOKS (W1) inserts all `player.js` lines, and WORLD-CAM (W1) inserts all `world.js` lines, against the W0 stubs. The logic owners then fill the modules those lines call.

**`src/game/player.js`** (inserted by GAME-HOOKS in W1; FEEL-MOVE owns the file in W2 and must keep every tagged line)

| # | location | line (sketch) | tags | logic owner |
|---|---|---|---|---|
| 1 | constructor (end) | initFeel?.(this); this.mount = null; this.superArmor = 0; this.awakenHoldK = 0; this.lastDashEnd = -9; | feel, cmp, awaken | FEEL-MOVE, CMP-MOUNT, AWAKEN-CORE |
| 2 | update(): right after tickTimers() | this.mount?.tick(dt, world, this, inp); | cmp | CMP-MOUNT |
| 3 | update(): before horizontal control | const gait = updateGait?.(this, world, dt, inp) ?? null;   // returns null while riding | feel | FEEL-MOVE |
| 4 | update(): dash branch | if (this.mount?.riding) { if (inp && input.pressed('dash')) this.mount.tryCharge(world, this, ax, input.axisY); if (this.mount.chargeT > 0) this.mount.updateCharge(dt, world, this); } else { existing dash + dashFx?.(this, world, phase); lastDashEnd on end } | cmp, feel | CMP-MOUNT, FEEL-MOVE |
| 5 | update(): movement numbers | const prof = this.moveProfile(gait); the horizontal-control block runs only while this.dashT <= 0 && !(this.mount?.chargeT > 0) (the charge owns vx, otherwise approach() would brake it); riding → mount.profile(this); else {speed: B × gaitMul × (world.gimmick?.speedMul ?? 1), accel, decel, …} | cmp, feel, gimmick | GAME-HOOKS (function), FEEL-MOVE (gait), CMP-MOUNT, GIMMICK-* |
| 6 | update(): crouch | this.crouch = !this.mount?.riding && … | cmp | CMP-MOUNT |
| 7 | handleJump(): first lines | if (this.mount?.riding && this.mount.handleJump(world, this, dt)) return;  then  if (world.gimmick?.onJumpInput?.(this)) return; | cmp, gimmick | CMP-MOUNT, GIMMICK-ENGINE |
| 8 | doJump() / wall jump | onJump?.(this, world, air); | feel | FEEL-MOVE |
| 9 | handleAttackInput(): first line | if (handleUltInput(this, world)) return;   // replaces `if (input.pressed('ult') && this.run.sp >= 100) …`; hold logic reads input.down('ult') + pressTime (R16) and cancels a hold that missed a frame | awaken | AWAKEN-CORE |
| 10 | handleAttackInput(): after command techniques | if (this.mount?.riding && down && this.mount.trySpecial(world, this)) { input.consume('attack'); return; } | cmp | CMP-MOUNT |
| 11 | handleAttackInput(): dash attack / down / crouch | (this.dashT > 0 \|\| this.sprinting) && ms.dash && !this.mount?.riding; skip ms.down and ms.crouch when riding | feel, cmp | FEEL-MOVE, CMP-MOUNT |
| 12 | handleAttackInput(): buffers | input.buffered(a, ATK_BUF + Math.min(0.3, world.frozenRecent ?? 0)) | feel | FEEL-IMPACT/WORLD-CAM (frozenRecent) |
| 13 | startMove() | if (this.mount?.riding) mv = this.mount.adaptMove(mv); | cmp | CMP-MOUNT |
| 14 | makeAttack() | moveId: mv.id | feel | FEEL-IMPACT |
| 15 | updateMove() / fireMoveProjectiles() / spawnMoveFx() | const L = this.mount?.riding ? this.mount.riderLift() : ZERO; rect x+L.dx, y+L.dy, w × 1.15 when riding | cmp | CMP-MOUNT |
| 16 | physics(): first line | world.gimmick?.prePhysics?.(this, dt); | gimmick | GIMMICK-ENGINE |
| 17 | physics(): after moveBody | this.mount?.afterPhysics(dt, world, this, vyBefore);  then  onLand?.(this, world, vyBefore, fallPx) (skipped while riding) | cmp, feel | CMP-MOUNT, FEEL-MOVE |
| 18 | physics(): spikes and liquid | if (!(this.mount?.riding && this.mount.hazard(kind, this, world))) { existing damage }; const liq = world.liquid ?? world.stage.liquid ?? 'water'; 'deep' skips the water slow-down | cmp, gimmick | CMP-MOUNT, GIMMICK-ENGINE |
| 19 | physics(): after the liquid block, before the safe-spot block | world.gimmick?.postPhysics?.(this, dt); squashSpring?.(this, dt); | gimmick, feel | GIMMICK-ENGINE, FEEL-MOVE |
| 20 | get invuln | … \|\| this.mount?.invulnT > 0 \|\| this.world?.companions?.shieldT > 0 | cmp | CMP-MOUNT, CMP-SYS |
| 21 | takeHit(): after the invuln and evade checks | const mr = world.companions?.incoming(this, dmg, attack) ?? null; if (mr?.cancel) return false; if (mr) dmg = mr.dmg; const armored = this.superArmor > 0 \|\| (mr?.mounted && mr.noStagger); armored → no hurtT/endMove/knockback, iframes 0.6; mounted heavy → hurtT 0.2, iframes 1.0, kb ×0.5; death block unchanged | cmp, awaken | CMP-SYS/CMP-MOUNT, AWAKEN-CORE |
| 22 | heal() | positive amounts × (this.world?.gimmick?.healMul?.() ?? 1) | gimmick | GIMMICK-KINDS-B (blight) |
| 23 | tickTimers(): HP regen | … && !world.gimmick?.noRegen | gimmick | GIMMICK-KINDS-B |
| 24 | die() | this.mount?.dismount(world, this, 'death'); | cmp | CMP-MOUNT |
| 25 | refreshStats() | if (this.mount?.riding) addStats(this.stats, this.mount.rideStats()); this.mount?.refresh(this); this.world?.companions?.onStatsChanged(); | cmp | CMP-MOUNT, CMP-SYS |
| 26 | hurtbox() | if (this.mount?.riding) return this.mount.hurtbox(this); | cmp | CMP-MOUNT |
| 27 | updateAnim() | riding branch first (mount.updateAnim + riderAnim); else the feel priority order move > throw > cast > dash > air > land_heavy > skid > pivot > crouch > charge > run_start > walk/run/sprint > land > idle; the stepT footstep block is removed (W2) | cmp, feel | CMP-MOUNT, FEEL-MOVE |
| 28 | draw() | riding: mount.draw(back) → drawHero(ctx, mount.riderView(this), world, opts) → mount.draw(front); else drawHero(ctx, this, …) | cmp | CMP-MOUNT |
| 29 | lights() / ghostTrail() | this.mount?.lights(L, this); if (this.mount?.riding) return this.mount.ghost(world, this, color); | cmp | CMP-MOUNT |
| 30 | snapshot() | copy gaitPh, feel.sq, gait | feel | FEEL-MOVE |
| 31 | update(): after the movement block, and in the hurt branch | this.noteFacing?.(); — 1 s ring of (t, facing) behind p.facingAt(t) (§1.21) | plat | GAME-HOOKS |
| 32 | handleAttackInput(): technique loop | const r = input.command(tech.cmd, (t) => this.facingAt(t), tech.window ?? 0.6); if (r.ok) { this.facing = r.facing; … castTechnique } | plat | GAME-HOOKS (player side), PLAT-INPUT (input.command) |

**`src/game/world.js`** (WORLD-CAM, W1)

| # | location | line (sketch) | tags |
|---|---|---|---|
| 1 | imports | Style (style.js), AW_GAIN (feel_hit.js), createGimmick (gimmicks.js), CompanionSystem (companions.js) | feel, gimmick, cmp |
| 2 | constructor, before loadRoom() | slowmoScale 0.35, freezeEnemies false, freezeLog [], frozenRecent 0, overlays [], hudHidden false, letterbox 0, killSlowT 0, style = new Style(this), run.aw = 0, awakenState = {ready:false, holdK:0}, gimmick = null, companions = new CompanionSystem(this) | feel, gimmick, cmp |
| 3 | getters | get liquid() { return this.room?.liquid ?? this.stage.liquid ?? 'water'; }  gimmickOf(kind) { return this.gimmick?.get(kind) ?? null; } | gimmick |
| 4 | loadRoom(): first line after the guard | this.gimmick?.dispose?.(); this.gimmick = null; this.fx.clearDecals?.(); this.overlays.length = 0; | gimmick, feel |
| 5 | loadRoom(): 'D' marker case | door.mark = room.doorMarks?.[n] ?? null; | gimmick |
| 6 | loadRoom(): after the lamp loop, before camera.follow | this.gimmick = createGimmick(this, room);  then  this.companions?.onRoomLoaded(roomId);  (companions §12.3 put it right after add(p); moved so the gimmick exists when the mount is re-seated) | gimmick, cmp |
| 7 | update(): hitstop branch | fx.update(dt × 0.3, map); camera springs at full dt; frozenRecent += dt | feel |
| 8 | update(): time scale | slowmo uses this.slowmoScale; enemy AI and enemy projectiles skip while freezeEnemies (enemy projectiles held like timeStop) | feel |
| 9 | update(): after fx.update | this.gimmick?.update(sdt) (skips progress while cutscene); this.style.update(dt); tick overlays; poll boss.phase (aw +15 per change); frozenRecent decays 1 s/s | gimmick, feel |
| 10 | update(): lighting, after entity lights | this.gimmick?.lights?.(this.lighting); | gimmick |
| 11 | render(): far background | bgFlip → mirrored drawFar | gimmick |
| 12 | render(): after bg.drawMid / tiles.draw / drawLiquid(this.liquid) | gimmick.drawWorld('under' \| 'back' \| 'front') | gimmick |
| 13 | render(): after lighting.render and bg.drawFront | gimmick.drawScreen(ctx, vw, vh) → feel overlays (letterbox, grade, radial lines, impact frame) → fx 'top' → timeStop tint | gimmick, feel |
| 14 | onPlayerHit(target, info, attack) | guardian tag → no combo.t refresh, SP ×0.4, no lifesteal; existing combo/score/SP/lifesteal; style.onHit; awakening gain (tier ≥ 1; 0 for ult/awaken/companion tags); companions?.onHit(target, info, attack) last | cmp, feel |
| 15 | endCombo() | style bonus rankIndex² × 500 on top of COMBO BONUS | feel |
| 16 | onEnemyKilled(e, attack) | existing → gainExp → companions?.onKill(e, exp) → kill slow-mo rules, multi-kill, style.onKill, aw +2/+8 | cmp, feel |
| 17 | onPlayerHurt(dmg) | style rank drop, game.vignette('#ff0020', 0.45, 3), awakening rage +6 (≥ 10% max HP) | feel |
| 18 | startBoss() / bossIntro onDone | companions?.onBossStart(boss) (noMount); aw +25 when the intro ends | cmp, feel |
| 19 | onBossDefeated(boss) | companions?.onBossDefeated(boss) | cmp |
| 20 | collect(): 'item' after the relic block | star shards and world hearts (world2 §3.9, with ??= []) | gimmick/p2 |
| 21 | collect(): 'food' | this.gimmick?.cleanse?.(30); p.mount?.healFrac(d.heal ?? 0.25); | gimmick, cmp |
| 22 | useSavePoint() / healPlayer() | this.player.mount?.healFrac(frac ?? 1) | cmp |
| 23 | onPlayerFell(p) | first line after the guard: if (p.mount?.riding) p.mount.dismount(this, p, 'fall'); after repositioning: this.gimmick?.onFell?.(p) | cmp, gimmick |
| 24 | respawn() | end: this.gimmick?.onRespawn?.(); this.companions?.onRespawn(); | gimmick, cmp |
| 25 | QA leftovers (integration notes) | <bossId>_post scripts play after the boss dies (story mode); arena camera y bias shows the floor in tall rooms; touch camera bias +0.06·viewW toward facing (platform §5.4, in camera.js) | plat |
| 26 | stickRect() / clearStickAtSpawn() | stickRect() reads touchpad.stickZone?.() (logical px) and falls back to today's rect; clearStickAtSpawn also runs after companions.onRoomLoaded when the mounted body is wider than the rider | plat, cmp |

**`src/render/hero.js`, `drawHero()` order** (ART-HERO-A in W2, ART-HERO-B in W3)

| # | step | rule | owner |
|---|---|---|---|
| 0 | dispatch | drawHero serves heroes, NPCs (p.npc), ghost snapshots (p.snapshot), menu previews (world = null) and one enemy renderer (shadow_hunter; the Part 2 reflection too). Painted mode: a hero with a puppet for (charId, classId) draws through hero_puppet.js; an NPC draws through src/render/painted/reg/npcs.js (ART-NPC) when it has an entry, else the vector path; tint, alpha, ghost and scale work on both paths. The hero draw scale 1.12–1.15 (notes) is visual only: hurtbox and collision are unchanged. | ART-HERO-A |
| 1 | resolve view | opts.yaw defined → view mode (facing ignored, HERO_VIEW steps); else side view (no yaw code runs) | ART-HERO-B (W3) |
| 2 | anim → pose | existing cases + case 'walk'\|'sprint'\|'run_start'\|'skid'\|'pivot'\|'land_heavy': gaitPose(P, K, anim, p, at); holdFor(P, K, GAIT_ANIMS[anim]); 'run' uses p.gaitPh when it is a number | ART-HERO-A (W2), using FEEL-MOVE's hero_gait.js |
| 3 | transition blend | rig.bd = 0.06 for skid/pivot/land_heavy, 0.12 between walk/run/sprint | ART-HERO-A |
| 4 | rider override | when p.ride: force pelvis to (ride.sx, ride.sy), seated legs, lean + ride.lean + 0.6·duck, skip the far leg, ride anims (companions §11.4); painted puppets need thigh/shin parts for the seated pose (acceptance: all 6 heroes seated on the warhorse and the wolf, pelvis within 2 px of the seat) | ART-HERO-A |
| 5 | feel overlay | applyFeelOverlay(P, p) (squash, accLean, sprint lean); no-op when p.feel is missing or p.ride is set | ART-HERO-A |
| 6 | solve / rig | IK solve (vector) or puppet bone solve (painted) | ART-HERO-A |
| 7 | view projection | vector: yaw projection with depth-ordered layers, front/back details, cloth in side-local space (platform §7.3); painted: HERO_VIEW {continuous:false, steps:8} from the 8 painted turntable directions per class (ART-HERO-ASSETS-*), cross-over squash between steps | ART-HERO-B (W3) |
| 8 | draw layers (detail) | detail overhaul; equipment must still change the look (weapon type/style/glow/enhance level, headgear, cape, armor, wings, aura, tier-7 'rift' shimmer) | ART-HERO-A |
| 9 | rim pass | budget-clamped scale; off on low quality | ART-HERO-A |
| opts | contract | drawHero(ctx, p, world, { yaw?, scale?, alpha?, tint?, ghost?, noRim? }): tint/alpha keep working for the reflection enemy and awakening spectral knights (cached ghost bitmaps) | ART-HERO-A/B |

### 1.8 HUD region allocation

Logical pixels. The view is 960 to 1280 wide and 540 tall; phones are wider than 960 (phone1 844×390 CSS → vw 1168, phone2 740×360 CSS → vw 1110, scale 0.72 / 0.67). "Touch" means `input.mode === 'touch'`. padLeft and padTop are the left and top edges of the right-hand pad cluster from `touchpad.occupiedRects()` (phone2: 674 / 186; phone1: 766 / 213). Persistent regions never overlap each other, the pad or the transient slot.

| region | drawn by | desktop | touch | notes |
|---|---|---|---|---|
| portrait + level badge | hud.js | x 14–80, y 12–78 | same | safeArea 'full': left anchors + game.safe.l, right anchors − game.safe.r, top anchors + game.safe.t |
| vitals (name, HP, MP, EXP) | hud.js | x 90–320, y 12–62 | same |  |
| hearts, sub-weapon, buffs | hud.js | x 90–350, y 64–90 | same | buff icons clip at x 350 (was 380: it collided with the centre stack) |
| skill slots + page hint | hud.js | x 14–102, y 92–154 | same | labels via prompts.drawGlyph; hint '[swap] 페이지 n/2' |
| ult (SP) gauge | hud.js | x 106–226, y 96–124 | same |  |
| awakening gauge (tier ≥ 1) | feel_hud.drawAwGauge | x 106–226, y 126–146 | same | label 각성 + 120×6 bar |
| ready text (ult / awakening) | feel_hud.drawAwGauge | x 106–236, y 148–170 | same | one line: '필살기 준비!' or '각성 가능! [F 길게]' (glyph per device) |
| companion widgets | companion_hud | x 244–372, y 92–160 | same | mount 40 px, guardians 38 px; labels [R]/[G], 탑승/수호, L3/R3 |
| call-out lane (guardian skill cards) | companion_hud | x 14–314, y 176–228 | same | card 300×52, queue ≤ 2 |
| score block | hud.js | x vw−164 – vw−14, y 10–72 | y 10–80 |  |
| combo + style (DNF column) | feel_hud.drawComboHUD | x vw−320 – vw−14, y 90–200 | bottom = min(200, padTop − 8) (phone2: 178) | padTop = top of the pad rects on the right half |
| system buttons Ⅱ / 가방 | touchpad.js | — | top centre, 2 × 44 CSS px (≈ vw/2 ± 75, y 8–75 logical on phone2) | from touchpad.occupiedRects() |
| gimmick meters | gimmicks.drawScreen via hudLayout().meter(i) | x vw/2 ± 100, y 12 + 20·i | y 76 + 20·i | ≤ 3 rows |
| toasts (stage/hub) | game.js toasts via hudLayout().toast(i) | centre gap x (380 + safe.l) – (vw − 328 − safe.r), 26 px rows below the meters, ≤ 3 rows, 15 px text wrapped to ≤ 2 lines | same rows; a row that reaches padTop ends at padLeft − 8; 1 row while the top boss bar shows | StageScene/HubScene toastX/toastY read it; safe.l/safe.r are 0 in the default safeArea fit |
| boss bar | hud.js | x (vw−w)/2, w = min(640, vw−260), y vh−72 – vh−24 | top slot = the centre gap, y 148–184, when the pad covers the bottom (phones); bottom slot as desktop when it does not (tablet band) | name left, title right (title hidden when w < 360) |
| announcer / banner (one transient slot) | feel_hud.drawAnnouncer, hud.js banner | centre (vw/2, 262), y 230–294, w ≤ min(560, vw − 644) | x (322 + safe.l) – min(vw − 322 − safe.r, padLeft − 8), centred in that span (≈ 344 px on phone2, ≈ 200 px with insets in safeArea full); text auto-scales down to 40 % | the banner (stage title, STAGE CLEAR, LEVEL UP) wins; announcer queue 2 |
| touch pad | touchpad.js (#tpadcv overlay) | — | right cluster (phone2: x ≥ 674, y ≥ 186 logical), floating stick in the left 45 % | no persistent HUD below y 297 on touch and none inside occupiedRects() |
| world-space text (callouts, hold ring, dmg numbers) | impact.js / awaken.js | near targets | same | not HUD |

- src/render/hud_layout.js (HUD-LAYOUT, W1) exports hudLayout(world, vw, vh, pad = touchpad.occupiedRects?.()) → named rects, meter(i), toast(i) and the transient slot; every HUD drawer, gimmicks.drawScreen and the game.js toast renderer read it. The pixel positions in feel §4.10, companions §7.1 and world2 §0 are superseded by this table.
- world.hudHidden (awakening cut-in and director) hides the whole HUD, including companion widgets and gimmick meters (drawScreen checks it).
- Acceptance (tools/test_hud_layout.mjs; HUD-LAYOUT in W1 against stub widgets, HUD-FINAL in W3 with the real ones): no two persistent rects overlap, and no persistent rect overlaps the transient slot or a pad rect, for desk960 and desk1280 (keyboard), phone1 (844×390 CSS → vw 1168) and phone2 (740×360 CSS → vw 1110) with the real touchpad.occupiedRects(), tablet (1024×768, pad in the bottom band) and touch 1280; each with and without the boss bar, 0–3 meters, 3 toasts, tier ≥ 1 gauge, 3 companion widgets, and safeArea 'full' with insets 47/47/0/21. The review modelled this table for 64 of those configurations (incl. insets) with zero overlaps; the v1.0 table overlapped in 6–9 places per configuration (touch boss bar over the ready text and companion widgets, announcer over the combo column, call-out lane and gauges, centre stack over the hearts row, combo column over the swap/skill2 buttons on phone2).
- The numbers assume pad size class S and touchScale 1. With touchScale up to 1.3 or a custom touchLayout, hudLayout recomputes padLeft/padTop from occupiedRects() whenever the pad changes; the combo column, toasts and transient slot shrink rather than overlap.

### 1.9 Audio SFX name registry

| group | count | names |
|---|---|---|
| existing (src/core/audio.js) | 76 | whip whip_crack slash slash_heavy gun shotgun dagger axe cross holywater_burn stopwatch magic holy fire ice thunder dark hit hit_heavy crit clang enemy_die explode jump double_jump land footstep dash mist splash hurt death heart coin item powerup levelup extra_life chest heal save candle door break_wall secret bell clock_tick thunderclap bat ghost boss_roar boss_die warning ult combo charge_ready enhance_hit enhance_success enhance_fail enhance_destroy dice card slot_spin slot_win win lose coin_insert ready go menu_move menu_ok menu_cancel type (+ _default) |
| feel (src/core/sfx_feel.js, AUDIO-FEEL) | 45 | step_stone step_dirt step_wood step_metal step_snow step_water step_bone step_flesh step_push skid pivot land_heavy dash_burst launch wall_bounce ground_bounce down_hit counter back_attack hit_flesh hit_bone hit_ghost hit_stone impact_crack kill_slowmo rank_up announce combo_milestone ult_impact impact_frame awaken_hold awaken_charge cutin_whoosh brush_stroke seal_stamp eye_glint awaken_stinger awaken_boom heartbeat crow_caw finger_snap cylinder_spin choir_gate war_horn sheath |
| companions (src/core/audio_companions.js, AUDIO-CMP) | 26 | summon dismiss mount_up neigh gallop hoof_land boar_grunt wolf_howl wolf_bite wing_flap roar_small fire_breath screech bone_rattle fairy_chime knight_guard imp_cackle owl_hoot gear_whir scythe soul_reap egg_crack companion_join bond_up knock_off assist |
| Part 2 companion cries (audio_companions.js, AUDIO-CMP) | 5 | stag_call griffin_cry mirror_chime jelly_zap momo_gulp |
| world2 | 0 | uses existing names only (world2 §0) |

- No name collides across the four groups (checked against audio.js at 13:56 UTC).
- audio.js (AUDIO-FEEL, W1) adds: Object.assign(SFX, FEEL_SFX); def.fn(S, H) with H = {T, N, FM, ARP, BOOM, CRACKLE, mtof, R}; export function defineSfx(name, def, vol); export const SFX_KIT = {T, N, R}. sfx_feel.js must not import audio.js; audio_companions.js imports audio.js and registers through defineSfx (imported for side effects by companions.js).
- Budgets: at most 10 feel SFX starts per 100 ms (8 medium, 6 low); per-hit material layers are skipped when more than 6 hit* voices are live; MAX_SFX 26 stays.
- Footstep surfaces for Part 2 (FEEL-MOVE adds to SURFACE): s14 metal (glass), s15 metal, s16 water when inLiquid or the room has liquid else stone, s17 stone, s18 flesh, s19 dirt, s20 stone; unknown stages → stone.
- Stable scene music: 'hub' (no new track). Awakening ducks music (audio.duck) and uses no new track.

### 1.10 `src/core/game.js` edits (single owner: PLAT-CORE in W1)

| source | change |
|---|---|
| platform §6.1 safe areas | game.safe {l,r,t,b} from platform.safeInsets() (PLAT-BOOT: env() probe ⊕ window.__BN_INSETS); safeArea 'fit' lays the canvas inside the safe rect |
| platform §6.2 UI scale | game.cssScale, uiK/uiW/uiH; scenes with uiScale = true render inside ctx.scale(uiK) with input.setPointerTransform; ui text floor on (ui.setTextFloor) while such a scene renders |
| platform §6.4 budget + governor | dpr = min(devicePixelRatio, cap, sqrt(budget/(cssW·cssH))); symmetric quality governor for 'auto' on all devices (replaces autoQuality) |
| platform §6.5 pacing | fpsCap 60: render() only when ≥ 1 tick ran this rAF or game.dirty; input.pollFrame() once per rAF |
| platform P-18 pad | game.syncPad() stays the only visibility owner: touchpad.setVisible(input.mode === 'touch' && !portraitLocked && scene shows pad); legacy helpers become shims that set scene flags |
| platform P-26 | pop() on the last scene → go('title') |
| platform §6.6/§6.7/§9.3 | boot progress hand-off and boot error screen hooks; wake lock, cursor hide, fullscreen and SW update live in platform.js (PLAT-BOOT); game.js exposes game.dirty and the scene flags they read |
| feel §4.9 flash policy | flash(color, strength, decay): strength × settings.flashFx, cap 0.7, more than 2 flashes above 0.3 within 1 s → later ones capped at 0.3 |
| feel §4.9 vignette | new game.vignette(color, a, decay): edge vignette state drawn after the flash in render() |
| toasts (QA-fix + this plan) | keep toastX/toastY/toastUp and the 'menu' check; skip toasts while the top scene has deferToasts or hideToasts (awakenCutin, ultCutin, companionJoin, story); StageScene.toastY comes from hudLayout (§1.8); at most 3 visible in stages; safe-area offsets; toast font from FONT.body (R10: game.js hard-codes "Noto Sans KR" today); stage/hub toasts use hudLayout().toast(i): 15 px, wrapped to ≤ 2 lines inside the centre gap |
| fonts follow-up | main.js awaits ui.fontsReady before game.start (PLAT-BOOT owns main.js) |

### 1.11 Haptics and rumble (single owner)

- Single owner: src/core/haptics.js (PLAT-INPUT). input.rumble(strong, weak, ms) delegates to haptics.rumble(): applies settings.ctrlRumble, 60 ms throttle per effect, a stronger effect cancels a weaker one, reset() on pause/menu/blur; pad uses vibrationActuator 'dual-rumble', the APK uses BNAndroid.rumble when present, phones use navigator.vibrate only if settings.vibration and only for strength class H or above (15 ms), S (60 ms) and the awakening pattern [40, 30, 80].
- Per-hit rumble comes only from impact.js (strength table, feel §4.1). haptics.js therefore does NOT subscribe to hitCrit/hitHeavy (those bus events still exist for other listeners).
- haptics.js subscribes to: playerHurt (hurt / hurtHeavy), bossKilled (bossDie), playerDied (death), levelUp, ultimateCast (ult), shake (explode, from legacy camera.shake(mag ≥ 8)). impact.js does not rumble for player-hurt.
- The awakening stinger rumble (0.6/0.9/400 ms) is called directly by awaken.js; haptics ignores awakenCast.

### 1.12 Bus event registry

| group | events |
|---|---|
| existing | enemyKilled bossKilled itemPicked goldPicked docFound relicFound secretFound stageCleared stageEntered roomEntered playerHurt playerDied levelUp classChanged enhance minigame npcTalk questDone questClaimed combo |
| platform | inputDevice {kind, name, glyphs} · hitCrit {target} · hitHeavy {cls} · shake {mag} |
| feel | ultimateCast {charId, tier, classId} (castUltimate; replaces platform's ultStart) · awakenCast {charId, tier, classId} · styleRankUp {rank} · comboMilestone {n} |
| world2 | shardFound {id} · heartFound {id} |
| companions | companionUnlocked {id, source} · companionLevelUp {id, level} · bondUp {id, rank} · mounted {id} · dismounted {id, reason} · guardianSkill {id, auto} · eggObtained {id} · eggHatched {id} (ultimateCast shared) |

### 1.13 Scenes, overlays and cut-ins

| scene | file | registered in | flags | pushed by | rules |
|---|---|---|---|---|---|
| ultCutin | scenes/overlays.js | scenes/index.js (existing) | opaque false, hidePad, deferToasts | skills.js castUltimate | 0.9 s (feel §5.3); never while awakenCutin is on the stack |
| awakenCutin | scenes/awaken_cutin.js | scenes/index.js (SKEL) | opaque false, hidePad, deferToasts; sets world.hudHidden | awaken.js castAwakening | 1.45 s full / 0.75 s short; skippable after 0.5 s; world frozen (only the top scene updates) |
| bossIntro | scenes/overlays.js | existing | existing | world.startBoss | onDone grants aw +25; bloodText name |
| dialogue (boss phase scripts) | scenes/dialogue.js | existing | existing | boss code (b_narkissa_shatter, b_mara_dream, b_nihil_form2, b_nihil_final) | pushed only when !world.cutscene (queued until the ultimate/awakening ends), story mode only, once (seenScripts) |
| story | scenes/front/story.js | reg_front.js (existing) | deferToasts | flow | supports {cmd:'recruit'} |
| companionJoin | scenes/companion_join.js | scenes/index.js (SKEL) | opaque true, uiScale, deferToasts | companionHubEnter (hub) and the stable scene only | never pushed over a stage |
| stable | scenes/town/stable.js | reg_town.js (SKEL) | uiScale | hub door 'scene:stable' | closed mode before chapter 1 |
| menu (tab 'companions') | scenes/menu/tab_companions.js | MENU_TABS row after 'class' (PLAT-MENU) | uiScale (menu) | menu | glyph 'paw' |
| account / cloud UI | scenes/front/account.js, cloud_ui.js | reg_front.js (EXT-ACCOUNTS) | uiScale (PLAT-FRONT adopts) | title/slots/system tab | hidden when GET /api/health fails |
| options remap sub-pages | scenes/front/options_controls.js | not a scene (options pages) | uiScale | options | capture next button/key, swap on conflict |
| touch layout editor | core/touchpad.js openEditor() | DOM overlay, not a scene | — | options › 터치 | saves settings.touchLayout |

- Only one cut-in at a time. castAwakening and castUltimate refuse while world.cutscene, world.cleared, world.transitioning, world.inputLock, a boss intro, p.dead or hitstun.
- Scene flags understood by game.js and the touch pad: opaque, hidePad, showPad, padHideButtons, deferToasts, hideToasts, uiScale, toastX/toastY/toastUp, autoPause().

### 1.14 Gameplay interplay rules

- Awakening and ultimates dismount first: castUltimate and castAwakening call p.mount?.beforeCast(world, p, 'ult'); auto-remount 1.4 s after the director ends if on ground and findMountSpot succeeds.
- Guardian resonance (bond ≥ 3) triggers on ultimateCast and awakenCast and fires when world.cutscene returns to false (guardians never target during cutscenes).
- world.freezeEnemies is honored by Enemy (FEEL-REACT, W1), Boss/BossA/BossB (FEEL-BOSSHOOKS, W1) and by c_common.js-based Part 2 bosses (BOSS-P2-KIT helpers). Gimmicks pause their progress while world.cutscene.
- Boss damage cap for one awakening: 30% of boss max HP (feel §6.1), through attack.capFn read in impact.preImpact.
- b_nihil 'final' transition: world.run.sp = 100 and, when the hero's class tier ≥ 1, world.run.aw = 100 (the finale is the awakening moment); buffs.holyaura 20; voidwall open.
- Style: companion hits count ×0.5; AW gain is 0 for ult/awaken/companion tags; SP gain ×0.4 for guardian hits (companions §5).
- noMount: no boss sets it by default; W4 QA may set it per boss in data/bosses_*.js (FIX-DATA).
- Hitstop: guardian auto hits use hitstop 0 (mandatory), assists 0.03; the rolling cap (0.40 s per 1 s) applies to all non-S/A hits.
- STAGE_ORDER now includes the Part 2 stages that exist, and every consumer picks P1 or all explicitly: worldmap page 0 = STAGE_ORDER_P1 (WORLDMAP-P2); arcade_run survival draws enemies from STAGE_ORDER_P1 unless p2Known and never spawns enemies flagged def.noArena (P2-DATA sets it on gimmick-dependent enemies such as chandelier_fiend, the deep-water swimmers and cloud_jelly) (PLAT-FRONT-B); arcade.js lists stay all (world2 §11); slots.js latest stage = all (PLAT-FRONT-A); church.js, tab_bestiary.js, tab_system.js and access.js use all but group Part 2 (PLAT-TOWN, PLAT-MENU); tools/balance.mjs rows = all (P2-QA).

### 1.15 Art approach (TBD) and the art work split

| area | approach | packages / scope | must keep / contract |
|---|---|---|---|
| hero | TBD until GATE:ART-DECISION. The integration notes record painted cut-out puppet (Approach B): 8 painted turntable directions per class, class change via img2img keep-pose on the same rig, armour recolour masks, procedural cape with a painted texture, procedural weapons, per-hero grip-hand parts; about 230–260 Kling images for 6 heroes × 7 classes. Runtime src/render/hero_puppet.js; pipeline tools/puppet/{ingest.py, build_rig.py, build_turn.py, build_all.py, lib/pup.py, rigs/<hero>/, src/<hero>/}; assets assets/puppets/<hero>/<class>/. The vector renderer stays as the fallback and for NPCs until ART-NPC converts them. | ART-HERO-A (W2: runtime integration: puppet dispatch, gait/feel hooks, rider pose, equipment visuals, NPC dispatch), ART-HERO-ASSETS-1…3 (W2, painted only: sera+victor, bran+lia, azel; Kael comes from EXT-ARTBAKEOFF), ART-NPC (W2: 7 NPCs incl. Greta and Rook's Part 2 look), ART-HERO-B (W3: HERO_VIEW and opts.yaw for the turntable) | class change changes the look; equipment changes the look; drawHero opts contract; low-quality path; ≤ 1.5× side-view cost for yaw views; NPCs and menu previews keep drawing through drawHero; rider seated pose for all heroes |
| creatures | TBD until GATE:ART-DECISION. The notes record painted puppet + procedural VFX layers: runtime src/render/painted/{kit,registry,enemy_kit}.js; renderers src/render/painted/{bosses,enemies,companions}/<id>.js; assets assets/painted/{bosses,enemies,companions}/<id>/; tools tools/painted/{configs/<id>.json, poses/<id>.mjs, raw/<id>/, enemies/<id>/}. Already done by the bake-off: b_bonedragon and the 5 reference enemies bat, ghost, skeleton, armor_knight, gravedigger. | 13 existing bosses (ART-BOSS-1…5, W2), 7 Part 2 bosses (ART-BOSS-6…8, W3, after BOSS-P2-*), 62 remaining existing enemies (ART-ENEMY-1…5, W2), 24 Part 2 enemies (ENEMY-P2-C-ART, ENEMY-P2-D-ART), 20 companions (CMP-MOUNT-ART-A/B, CMP-GUARD-ART-A/B), 7 NPCs (ART-NPC) | renderer signatures unchanged (ENEMY_RENDER[id](ctx, e, world, {flash}); boss draw(ctx, world)/paint); origin feet-centre; facing by caller; flash overlay; elite tint by caller; anim from e.anim/e.animT; no Math.random or fx.emit in draw code (painted kit rule); procedural fallback when an image is missing; per-draw cost ≤ 1.5× today's renderer (gallery perf loop); painted memory ≤ 15 MB per boss desktop / 6 MB phone; painted files load through assets.js (packs, lo/, decoded LRU); resident painted textures per scene ≤ 24 MB decoded on phones, ≤ 64 MB desktop (§5.2); mounts draw in two layers (back/front) around the rider in both approaches |

**Enemy renderer split (after ART-ENEMY-SPLIT)**

| package | file | enemies |
|---|---|---|
| ART-ENEMY-1 | src/render/enemies_a.js | common + s01–s03 (19; painted: 14 new, the 5 bake-off references bat, ghost, skeleton, armor_knight, gravedigger are polish only): mimic golden_bat bat zombie skeleton crow wolf possessed ghost wisp bone_thrower gravedigger mud_man armor_knight axe_armor gargoyle medusa_head medusa_spawner skeleton_archer |
| ART-ENEMY-2 | src/render/enemies_a2.js | s04–s06 (15): blood_skeleton phantom_sword lesser_demon spear_guard puppet_maiden bone_pillar mummy skeleton_knight corpse_worm bone_scimitar book_fiend flea_man skeleton_mage scholar_ghost ectoplasm |
| ART-ENEMY-3 | src/render/enemies_b.js | s07–s09 (14) + PROJ_B/ZONE_B: slime homunculus flesh_golem plague_doctor acid_turret merman killer_fish frog_demon drowned water_spirit gear_golem harpy clockwork_soldier cog_wheel |
| ART-ENEMY-4 | src/render/enemies_b2.js | s10–s11 (10): ice_golem frost_wraith snow_wolf frozen_knight ice_bat succubus blood_priest bone_angel death_knight cursed_nun |
| ART-ENEMY-5 | src/render/enemies_b3.js | s12–s13 (9): vampire_bride demon_lord bat_swarm royal_guard chaos_spawn hellhound abyss_eye shadow_hunter void_demon |

**Boss split (drawing only)**

| package | files | bosses |
|---|---|---|
| ART-BOSS-1 | a_nightwing.js, a_banshee.js, a_dullahan.js | b_nightwing, b_banshee, b_dullahan |
| ART-BOSS-2 | a_crimson.js, a_bonedragon.js, a_grimoire.js | b_crimson, b_bonedragon, b_grimoire (Bone Dragon: finish the bake-off prototype) |
| ART-BOSS-3 | a_chimera.js, b_leviathan.js, b_colossus.js | b_chimera, b_leviathan, b_colossus |
| ART-BOSS-4 | b_frostqueen.js, b_death.js | b_frostqueen, b_death |
| ART-BOSS-5 | b_dracula.js, b_chaos.js | b_dracula (both forms), b_chaos |
| ART-BOSS-6 (W3) | c_narkissa.js, c_moloch.js, c_dagon.js | b_narkissa (incl. shatter phase), b_moloch, b_dagon |
| ART-BOSS-7 (W3) | c_ziz.js, d_mara.js, d_behemoth.js | b_ziz, b_mara (incl. dreamshift), b_behemoth |
| ART-BOSS-8 (W3) | d_nihil.js | b_nihil (all four forms incl. form2 and final) |

- ART-BOSS packages change drawing code only (no pattern, timing, hitbox or hit-part changes). Shared helpers go into the ART-KIT module, never into a_common.js/b_common.js.
- ART-ENEMY-SPLIT (W1, vector_hd only) is mechanical: it moves renderers into five files so each ART-ENEMY package owns one; shared helpers move to src/render/enemies_shared.js (not 'enemy_kit', the painted runtime's name); exports RENDER_A, RENDER_B, PROJ_B, ZONE_B keep their names (RENDER_A = {...A1, ...RENDER_A2}, RENDER_B = {...B1, ...RENDER_B2, ...RENDER_B3}); gallery screenshots must be pixel-identical before and after. In painted mode it is skipped (recorded done): painted renderers are separate files and the vector renderers stay untouched as the fallback.
- Painted ownership per creature id: assets/painted/{bosses|enemies|companions}/<id>/**, src/render/painted/{bosses|enemies|companions}/<id>.js, tools/painted/configs/<id>.json, tools/painted/poses/<id>.mjs, tools/painted/raw/<id>/**, tools/painted/enemies/<id>/** (enemies), tools/painted/companions/<id>/** (companions); per package: src/render/painted/reg/<key>.js, tools/painted/prompts/<key>.mjs, tools/kling/manifest_<key>.json. Heroes: tools/puppet/{src,rigs}/<hero>/**, assets/puppets/<hero>/**, tools/puppet/manifest_<key>.json. (v1.0 used assets/painted/<id>/** and tools/painted/<id>/**, which do not match the bake-off layout.)
- Registration: ART-KIT (W1) turns src/render/painted/registry.js (one registerPainted line per boss today) and src/render/painted/enemies/index.js (one import + reg line per enemy today) into aggregators over src/render/painted/reg/*.js: one stub per art package exporting {bosses:{}, enemies:{}, companions:{}, npcs:{}} (id → lazy importer). No W2+ package edits the aggregators (R15); v1.0 left both files frozen in W2 although ~20 packages had to add lines.
- Sizes: painted-mode art packages are XL (about 1.5–2 agent-hours per creature incl. Kling, matte, rig, renderer and verification) and checkpoint per creature (R15); in vector_hd mode the same packages are L.
- Budget: the lead sets a Kling credit budget per package (open item); every art package reports images generated vs budget in its R13 report.

### 1.16 Front-scene edits (fonts follow-ups, accounts, platform)

The bloodText call sites from the fonts follow-ups (title logo, HUD stage card, boss intro/WARNING/GAME OVER, results, arcade result, THE END, NEW RECORD, JACKPOT) go to whoever owns each file in the wave that touches it.

| file | owner | edits |
|---|---|---|
| src/scenes/title.js | PLAT-FRONT-A (W2) | bloodText logo; update-ready prompt (platform.onUpdateReady); pad audio-unlock hint; iOS add-to-home card; '안드로이드 앱(APK) 받기' (web + Android UA); keep the accounts entry (EXT-ACCOUNTS); uiScale; glyph footer |
| src/scenes/front/common.js | PLAT-FRONT-A | footer/hint via prompts.legacyKey; backButton/gbutton ≥ 44 CSS px; setPad → scene flags; applySettings no longer writes --touch-op (the canvas pad reads settings.touchOpacity) |
| src/scenes/front/slots.js | PLAT-FRONT-A | drawSlot hasOwn guard (B103 pending); cloud badges from accounts; chapter up to 20 with a Part 2 marker |
| src/scenes/front/account.js, cloud_ui.js | PLAT-ACCOUNT-UI (W2, after EXT-ACCOUNTS) | uiScale, glyph hints, 44 px targets; P-29 pad message for code entry |
| src/scenes/front/highscore.js | PLAT-FRONT-A | bloodText 'NEW RECORD' |
| src/scenes/front/arcade.js | PLAT-FRONT-B | world2 §11: BOSS_ORDER + 7, COURSES 이계편/전 보스 연속, LEVEL_PRESETS 이계의 순례자, wtier ≤ 7, p2Known; presets use baseIdFor (integration note) |
| src/scenes/front/arcade_run.js | PLAT-FRONT-B | bloodText result/rank; survival hard mode wires the arena 'pit' room; Math.min(7, P.wtier); survival: STAGE_ORDER_P1 unless p2Known, never def.noArena enemies (§1.14) |
| src/scenes/front/charselect.js, difficulty.js, dialogs.js | PLAT-FRONT-A | uiScale, glyphs, tap sizes (turntable preview on charselect optional) |
| src/scenes/front/options.js (+ options_controls.js) | PLAT-OPTIONS (W2) | §1.5 pages, remap screens, guides from bindings |
| src/scenes/front/story.js | STORY-P2-A (W2) | {cmd:'recruit'} (world2 §2.4); uiScale; keep name/portrait override |
| src/scenes/front/ending.js | STORY-P2-A (W2) | world2 §2.2/§2.3 (ENDINGS p2/p2true, decideEnding, credits slides/stats/notes, p2_prologue after true credits, leave → hub for p2 kinds); bloodText 'THE END' |
| src/scenes/overlays.js | OVERLAYS (W2) | bloodText boss intro/WARNING/GAME OVER; UltCutinScene upgrade; pause/gameover hub {from: w.stage.id} |
| src/scenes/results.js | PLAT-DIALOG (W2) | bloodText STAGE CLEAR/rank; toEnding includes s20 |
| src/scenes/games/slot.js | PLAT-GAMES (W2) | bloodText JACKPOT |
| src/render/hud.js | HUD-LAYOUT (W1) | bloodText stage title card |
| src/main.js | PLAT-BOOT (W1) | await fontsReady before start |
| src/scenes/dialogue.js, src/scenes/pause.js | PLAT-DIALOG (W2) | {cmd:'recruit'} (world2 §2.4); portrait edge fade; pause '마을로 귀환' starts at the gate; uiScale, glyphs |

### 1.17 Story and data append points

| file / point | owner | content |
|---|---|---|
| src/data/enemies.js | SKEL (W0) | export const ENEMIES = { ...ENEMIES_A, ...ENEMIES_B, ...ENEMIES_C, ...ENEMIES_D }; |
| src/game/ai.js | SKEL (W0) | Object.assign(AI, AI_A, AI_B, AI_C, AI_D); |
| src/render/enemies.js | FEEL-BOSSHOOKS (W1, after the bake-off; not gated on the art decision) | ENEMY_RENDER = { ...RENDER_A, ...RENDER_B, ...RENDER_C, ...RENDER_D } (keep the bake-off's painted draw and preload hooks) |
| src/data/bosses.js | SKEL (W0) | BOSSES = { ...BOSSES_A, ...BOSSES_B, ...BOSSES_C, ...BOSSES_D } |
| src/game/bosses/index.js | FEEL-BOSSHOOKS (W1, after the bake-off; not gated on the art decision) | BOSS_CLASSES = { ...BOSS_A, ...BOSS_B, ...BOSS_C, ...BOSS_D } (painted preload already lives in a_common/b_common) |
| src/data/story.js (end of file) | SKEL (W0) | import { SCRIPTS_P2 } from './story_p2.js'; import { COMPANION_SCRIPTS } from './story_companions.js'; Object.assign(SCRIPTS, COMPANION_SCRIPTS, SCRIPTS_P2); (CREDITS_P2 is imported by creditsFor, STORY-P2-A) |
| src/data/story_p2.js | STORY-P2-A | SCRIPTS_P2 = { ...local, ...SCRIPTS_P2B } (story_p2b.js is STORY-P2-B's) |
| src/data/stages.js imports | SKEL adds 4 anchors after `import { ROOMS as ARENA } from './maps/arena.js';` | // ── P2 map imports s14–s15 (MAPS-P2-A) ── / s16–s17 (MAPS-P2-B) ── / s18–s19 (MAPS-P2-C) ── / s20 (MAPS-P2-D) ── |
| src/data/stages.js STAGES | SKEL adds 4 anchors before `  arena: S({` | // ── P2 stages s14–s15 (MAPS-P2-A) ── / s16–s17 (MAPS-P2-B) ── / s18–s19 (MAPS-P2-C) ── / s20 (MAPS-P2-D) ──; each maps package inserts directly after its own anchor |
| src/data/stages.js exports | SKEL (W0) | STAGE_ORDER_P1 (today's list), STAGE_ORDER_P2 = ['s14'…'s20'].filter((id) => STAGES[id]), STAGE_ORDER = [...P1, ...P2], SHARDS, HEARTS (RELICS kept) |
| src/game/skills.js | SKEL (W0) | import { SKILL_IMPL_P2, TECH_NAMES_P2 } from './skills_p2.js'; Object.assign(SKILL_IMPL, SKILL_IMPL_P2) right after SKILL_IMPL; Object.assign(TECH_NAMES, TECH_NAMES_P2); castUltimate: p.mount?.beforeCast?.(world, p, 'ult') + bus.emit('ultimateCast', …) before world.startUltimate; castSkill/castTechnique: p.mount?.beforeCast?.(world, p, id); placeholder `export const FXKIT = {};` (filled by FX-ULTS) |
| src/scenes/index.js | SKEL (W0) | register 'awakenCutin' and 'companionJoin' |
| src/scenes/reg_town.js | SKEL (W0) | register 'stable' |
| src/core/events.js | SKEL (W0) | registry comment lists every bus event in §1.12 |
| src/data/quests.js | ITEMS-P2 (W2) | LV to 20 chapters, MAIN s14–s20, 13 Part 2 side quests, and the Greta quests cq_hati/cq_skoll before QUEST_ORDER |
| src/data/items.js | P2-DATA (W1), ITEMS-P2 (W2) | TIER_LV/T_ATK/A_BASE/prices tier 7, rows 13–14 per table, ACC_TABLE, MATERIALS, KEYS (worldHeart/starShard/color), UNIQUE_LIST, mythics; MYTHIC_WEAPONS stays tier-6 only, MYTHIC_WEAPONS_P2 new |
| src/data/lore.js | P2-DATA (W1) | d21–d27 (d21 cmd per §1.21), l21–l34, LORE_ORDER and DOC_ORDER appended |
| src/data/npcs.js | CMP-TOWN (W2) | npc_greta + NPC_ORDER |
| src/data/town.js | CMP-TOWN (W2) | W = 96, stable door 89 'D', Greta 93 'N', BUILDINGS/TOWN_LAMPS/TOWN_PROPS/TOWN_NPCS/TOWN_TALK entries |
| src/data/music.js | EXT-MUSIC-P2 | 11 tracks (world2 §12) |
| src/render/painted/registry.js, src/render/painted/enemies/index.js | ART-KIT (W1) | aggregate src/render/painted/reg/*.js (one stub per art package incl. reg/npcs.js); nobody edits the aggregators afterwards (R15) |

### 1.18 Item ids and tiers

| topic | decision |
|---|---|
| tiers | 1–7; tier 7 = Part 2 (TIER_LV[6] = 50, roman Ⅶ); tierForLevel/baseIdFor/rollItem clamp to 7; arcade Math.min(7, wtier) |
| weapons tier 7 | w_whip_13/14, w_sword_13/14, w_greatsword_13/14, w_dagger_13/14, w_gun_13/14, w_staff_13/14 (icons <type>_7, visual {style: 6, rift: true}) |
| armour tier 7 | a_head_13/14, a_body_13/14, a_cloak_13/14 (icons head_7/body_7/cloak_7) |
| accessories tier 7 | a_ring_13, a_ring_14, a_amulet_13, a_amulet_14 (icons ring_7, amulet_7) |
| materials | m_mirror, m_ember, m_pearl, m_gale, m_dream, m_spore, m_void |
| key items | k_rift_lantern, k_heart_1…6 (worldHeart n, color), k_star_1…6 (starShard n), k_dawnflower |
| boss/quest uniques | u_narkissa, u_moloch, u_dagon, u_ziz, u_ziz2, u_mara, u_behemoth, u_nihil, u_nihil2, u_alberto |
| Part 2 mythics | u_dawn_whip, u_dawn_sword, u_dawn_great, u_dawn_dagger, u_dawn_gun, u_dawn_staff → MYTHIC_WEAPONS_P2 |
| companions | no ITEMS entries (eggs and pacts are companion state; 「소악마 계약서」 is a stable-shop row) |
| rarity / enhancement | unchanged: rarity 0–5, enhancement 0–15 (quest hd_plus15) |
| loot | world2 §6.9: uniques first kill then 40%; worldHeart never duplicated; mythic b_nihil first kill, other P2 bosses 1.5%, s20 elites 0.6%; chapter ≥ 14 draws MYTHIC_WEAPONS_P2 |
| hero visuals | the hero renderer treats visual.rift as an optional iridescent shimmer on style 6 (never an unknown style index) |

### 1.19 Music ids

| group | ids |
|---|---|
| existing | title prologue hub inn shop smith church worldmap s01 … s13 arena boss boss2 dracula chaos victory gameover ending credits minigame story sad |
| Part 2 (EXT-MUSIC-P2) | s14 s15 s16 s17 s18 s19 s20 boss3 boss4 nihil worldmap2 |
| assignment | boss3: b_narkissa, b_dagon, b_mara · boss4: b_moloch, b_ziz, b_behemoth · nihil: b_nihil · worldmap2: world map page 1 (crossfade on page switch) · stable: hub · companions/feel: no new music |

### 1.20 Delivery configuration

| topic | decision |
|---|---|
| web build | tools/deploy/build_web.mjs copies an allowlist into dist/web (index.html, build-info.js, manifest.webmanifest, sw.js, css/, src/, assets/ incl. assets/lo/ and assets/fonts/, robots.txt, downloads/); fatal deny check for tools\|docs\|android\|node_modules\|netlify\|dist\|.git and *.keystore\|*.jks\|*.p12\|*.properties\|.env; files > 25 MB fail; dist/web ≤ 90 MB with painted art (platform §9.1 said 60 MB before the painted decision). The canonical output dir is dist/web (platform §9.1; the integration note's 'dist-web' is the same thing). |
| netlify.toml | [build] command = 'node tools/deploy/build_web.mjs', publish = 'dist/web'; [build.environment] NODE_VERSION = '22'; [functions] directory = 'netlify/functions'; headers per platform §9.2 with CSP script-src 'self' (no inline scripts after PLAT-CORE), style-src 'self' 'unsafe-inline', font-src 'self', connect-src 'self', img-src 'self' data: blob:; Permissions-Policy adds gamepad, fullscreen, screen-wake-lock, autoplay; keep accounts' COOP and /api/* no-store; _redirects /apk and /download → /downloads/BloodNocturne.apk 302. Never deploy with --dir . |
| service worker | versioned precache (bn-<buildHash>), cache-first src/css/fonts, bn-assets-v1 LRU 250 for assets, network-first navigations with a 3 s timeout; never touches /api/, /downloads/, build.json, non-GET or cross-origin; SKIP_WAITING only on request; registered on localhost unless ?nosw |
| APK | WEB_FILES = dist/web minus sw.js and downloads/; AssetServer proxies https://appassets.androidplatform.net/api/* to the Netlify origin read at build time from tools/apk/api_origin.txt (headers and body unchanged, no cache, 15 s timeout → JSON error); WebView ≥ 98 gate; __BN_INSETS bridge + 'bn-insets' event; optional BNAndroid.rumble; MIME table covers every file type in dist/web; ≤ 45 MB with painted art (platform's 20 MB assumed vector art; today's APK is 13.3 MB and Kael's 7 puppet classes alone are ≈ 3 MB, so 6 heroes + 110 creatures add ≈ 30 MB); above 45 MB the APK ships phone-density atlases only (assets/lo/ and painted td ≤ 0.75); only INTERNET and VIBRATE permissions |
| artifact | tools/deploy/build_artifact.mjs (DELIVERY-WEB) builds dist/artifact/ from dist/web: the page is generated from index.html (not the hand-kept tools/artifact/blood_nocturne.html, which still carries the legacy #touch DOM), src/**/*.js is bundled into ≤ 8 chunk files by a zero-dependency bundler, assets are packed into ≤ 40 pack files (assets/packs/<n>.bnpack + index.json) that assets.js reads (PLAT-SAVE-ASSETS), fonts and OFL.txt stay files. A claude.ai artifact version holds ≤ 511 files / 256 MB and one publish ≤ 255 files / 64 MB, while today's tree already has ≈ 600 runtime files (166 src + 432 assets), so the old plan (republish the page with its files) cannot work. Accounts are hidden there (CSP blocks /api) and saves stay local; the service worker is not registered in the artifact. |
| keystore | tools/android/release.keystore and keystore.properties are git-ignored, never published and never committed; handed to the user privately at the end (DELIVER-HANDOFF) with backup instructions in docs/RELEASE.md (no password in docs) |

### 1.21 Command techniques (d21 fix)

- d21 비전서: 경영참 (tech_mirror): cmd ['d','uf','btn:attack'] (↓↗+공격) instead of world2's ['b','b','btn:attack']: [b,b] also collides with the back sprint double-tap. ↓↗ is not a subsequence of any existing command and contains none, but a rolling ↓↘→↗ motion also completes d02 (↓↘→) and a rolling ↓↙←↖↑↗ completes d11 (↓↑), and learned techniques are tried in acquisition order, so the d21 text tells the player to flick from ↓ straight to ↗.
- Facing fix (existing bug, §1.4 rules): input.command evaluates f/b against the facing at the first direction of the sequence (p.facingAt), so d05 선풍각 ↓↙← and d19 그랜드 크로스 →↓←↑ work from a standstill (today they only fire when the hero cannot turn, e.g. mid-move). PLAT-INPUT + GAME-HOOKS in W1.
- d14 수룡참 [f,f] vs the DNF sprint dash attack: →→ then attack within 0.25 s of the second press = d14 (learned and enough MP); a later attack while sprinting = dash attack. d23 와류참 [u,u] and d26 정화의 불꽃 [u,f] stay as in world2.
- QA (tools/qa/commands.mjs, QA-TOOLS, every W4 round): every technique d02…d27 fires by keyboard, pad stick sectors and touch (8-way sectors, 0.8 s window), from a standstill and while running, and →→+attack late in a sprint stays the dash attack.

---

## 2. Wave overview

| wave | goal | packages | keys |
|---|---|---|---|
| W0 | Skeleton gate (runs now, alongside the in-flight agents) | 1 | SKEL |
| W1 | Foundation: engines, hooks, APIs, data ids, platform core | 22 | PLAT-INPUT, PLAT-TOUCH, PLAT-CORE, PLAT-BOOT, PLAT-SAVE-ASSETS, PLAT-QA, FONTS-FU, HUD-LAYOUT, AUDIO-FEEL, FEEL-IMPACT, FEEL-REACT, FEEL-BOSSHOOKS, WORLD-CAM, GAME-HOOKS, GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA, BOSS-P2-KIT, CMP-DATA, ART-ENEMY-SPLIT, ART-KIT |
| W2 | Features, content and art | 60 | FEEL-MOVE, FEEL-HUD, FX-ULTKIT, FX-ULTS, OVERLAYS, AWAKEN-CORE, AWAKEN-DIR-A, AWAKEN-DIR-B, AUDIO-CMP, CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-B, CMP-MOUNT-ART-A, CMP-MOUNT-ART-B, CMP-GUARD-ART-A, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT-A, PLAT-FRONT-B, PLAT-ACCOUNT-UI, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES, PLAT-DIALOG, DELIVERY-WEB, MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, MAPS-P2-D, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ART-HERO-A, ART-HERO-ASSETS-1, ART-HERO-ASSETS-2, ART-HERO-ASSETS-3, ART-NPC, ART-BOSS-1, ART-BOSS-2, ART-BOSS-3, ART-BOSS-4, ART-BOSS-5, ART-ENEMY-1, ART-ENEMY-2, ART-ENEMY-3, ART-ENEMY-4, ART-ENEMY-5 |
| W3 | Second pass, harnesses, APK follow-ups, docs | 12 | ART-HERO-B, ART-BOSS-6, ART-BOSS-7, ART-BOSS-8, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH |
| W4 | Final integration and QA: full regression, performance budgets, loop until dry | 2 + 16 fix buckets per round | QA-ROUND, PERF-MOBILE |
| W5 | Pre-release audit (read-only, after GATE:QA-DRY) and its fix round | 7 | AUDIT-ENGINE, AUDIT-CONTENT, AUDIT-RENDER, AUDIT-UI, AUDIT-PLATFORM, AUDIT-ACCOUNTS-SEC, AUDIT-TRIAGE |
| W6 | Delivery (after GATE:AUDIT-CLEAN) | 6 | DELIVER-WEB, DELIVER-APK, DELIVER-ARTIFACT, DELIVER-HANDOFF, AUDIT-REPORT, QA-SIGNOFF |

**Critical path.** W0 SKEL → W1 PLAT-QA, GAME-HOOKS / WORLD-CAM / FEEL-IMPACT → W2 FX-ULTS → AWAKEN-CORE → AWAKEN-DIR-A/B → W3 FEEL-QA → W4 QA loop → GATE:QA-DRY → W5 audit (6 areas) → AUDIT-TRIAGE fix round → GATE:AUDIT-CLEAN → W6 DELIVER-WEB → DELIVER-APK → DELIVER-WEB redeploy → DELIVER-ARTIFACT → AUDIT-REPORT → QA-SIGNOFF. The art path is the longest in agent-hours: GATE:ART-DECISION → ART-KIT → ART-HERO-ASSETS-1…3 (XL) and FEEL-MOVE → ART-HERO-A → ART-HERO-B → turntable acceptance; BOSS-P2-* → ART-BOSS-6…8 (W3). The Part 2 gameplay path no longer waits for the art gate: EXT-ARTBAKEOFF → FEEL-BOSSHOOKS (C/D merges) and P2-DATA / GIMMICK-* → BOSS-P2-KIT → MAPS-P2-A…D and BOSS-P2-1…4 → P2-QA.

**Parallelism.** W1 has 22 packages, so it runs in about two batches of 10; start PLAT-QA, FONTS-FU and the bake-off-independent engine packages first (the platform packages depend on PLAT-QA's harnesses). Because waves are soft barriers (R2), a later-wave package whose dependencies are done may fill an idle slot early; STORY-P2-B, for example, needs only SKEL. W2 has 60 packages. Its packages share no files, so the orchestrator can fill all 10 slots continuously. Start the packages with the longest dependency chains first: FX-ULTS, FX-ULTKIT, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, FEEL-MOVE (ART-HERO-A waits for it), MAPS-P2-*, BOSS-P2-1…4 and the XL art packages; the XL art packages run 3–4 at a time so gameplay packages keep slots.

---

## 3. Wave details

Each package lists what it owns exclusively in its wave, any append-only hunks it adds to another package's file, what it depends on, the contracts it provides and consumes, the acceptance commands, and its size. `smoke` commands use `tools/smoke.mjs` (see ARCHITECTURE.md for step tokens; `eval=` runs JavaScript in the page).

### W0 — Skeleton gate (runs now, alongside the in-flight agents)

| key | title | size | depends on |
|---|---|---|---|
| **SKEL** | Skeleton: contract stubs, data/AI/story aggregators, scene registry, stage anchors, skills.js hooks | M | — |

#### SKEL — Skeleton: contract stubs, data/AI/story aggregators, scene registry, stage anchors, skills.js hooks (M)

- **Spec:** MASTER_PLAN §1.3 (stub table), §1.17 (append points); companions §12.1, §12.3 (scenes/index.js, reg_town.js, story.js, events.js, skills.js hook lines); world2 §4.2 exports, §5.1/§6.1 stubs and merges, §8 skills.js merge; feel §9 WP5 (scenes/index.js registration)
- **Owns:** `src/data/feel_move.js` (new), `src/game/feel_move.js` (new), `src/render/hero_gait.js` (new), `src/game/style.js` (new), `src/data/feel_hit.js` (new), `src/render/hitfx.js` (new), `src/render/feel_hud.js` (new), `src/render/ultfx.js` (new), `src/game/awaken.js` (new), `src/game/awaken_directors.js` (new), `src/game/awaken_directors_b.js` (new), `src/data/awaken.js` (new), `src/scenes/awaken_cutin.js` (new), `src/core/prompts.js` (new), `src/core/touchpad.js` (new), `src/render/hud_layout.js` (new), `src/game/gimmicks.js` (new), `src/game/gimmicks_b.js` (new), `src/data/enemies_c.js` (new), `src/data/enemies_d.js` (new), `src/game/ai_c.js` (new), `src/game/ai_d.js` (new), `src/render/enemies_c.js` (new), `src/render/enemies_d.js` (new), `src/data/bosses_c.js` (new), `src/data/bosses_d.js` (new), `src/game/bosses/c_narkissa.js` (new), `src/game/bosses/c_moloch.js` (new), `src/game/bosses/c_dagon.js` (new), `src/game/bosses/c_ziz.js` (new), `src/game/bosses/d_mara.js` (new), `src/game/bosses/d_behemoth.js` (new), `src/game/bosses/d_nihil.js` (new), `src/data/story_p2.js` (new), `src/data/story_p2b.js` (new), `src/game/skills_p2.js` (new), `src/data/companions.js` (new), `src/game/companion_state.js` (new), `src/game/companion_events.js` (new), `src/game/companions.js` (new), `src/game/guardian_ai_b.js` (new), `src/game/mount.js` (new), `src/render/mount_rig.js` (new), `src/render/mounts.js` (new), `src/render/mounts_b.js` (new), `src/render/guardians.js` (new), `src/render/guardians_b.js` (new), `src/render/companion_hud.js` (new), `src/scenes/menu/tab_companions.js` (new), `src/scenes/companion_join.js` (new), `src/scenes/town/stable.js` (new), `src/data/story_companions.js` (new), `src/core/audio_companions.js` (new), `src/game/mount_b.js` (new), `src/core/platform.js` (new), `src/game/bosses/bosses_c.js` (new), `src/game/bosses/bosses_d.js` (new), `src/data/enemies.js`, `src/game/ai.js`, `src/data/bosses.js`, `src/data/story.js`, `src/data/stages.js`, `src/scenes/index.js`, `src/scenes/reg_town.js`, `src/core/events.js`, `src/game/skills.js`
- **Depends on:** nothing
- **Provides:** every module in §1.3 exists with its contracted exports (no-op, legacy behavior preserved); ENEMIES/AI/BOSSES/SCRIPTS merge the C/D/P2/companion modules; BOSS_C/BOSS_D registries (final) that skip null classes; STAGE_ORDER_P1, STAGE_ORDER_P2 (filtered), STAGE_ORDER, SHARDS, HEARTS; eight anchor comments in stages.js (4 map groups: s14–s15, s16–s17, s18–s19, s20); scene names awakenCutin, companionJoin, stable registered; skills.js: SKILL_IMPL_P2 + TECH_NAMES_P2 merges, p.mount?.beforeCast hooks, bus ultimateCast, placeholder export FXKIT = {}; events.js registry comment (§1.12)
- **Notes:** Runs now, in parallel with the in-flight agents (it touches none of their files). Does not touch src/render/enemies.js or src/game/bosses/index.js (bake-off prototypes): ART-KIT adds those merges. The awaken.js stub must keep today's ult behavior because GAME-HOOKS replaces the ult line with handleUltInput().
- **Tests:**
  ```
  node tools/validate_maps.mjs
  node tools/integration.mjs
  node --input-type=module -e "await import('./src/data/stages.js'); await import('./src/data/enemies.js'); await import('./src/data/bosses.js'); await import('./src/data/story.js'); console.log('ok')"
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s01" --out /tmp/claude-0/proto/SKEL --steps "wait:2,right:1,attack:0.2,jump:0.3,ult:0.1,shot"
  node tools/smoke.mjs --url "index.html?scene=hub" --out /tmp/claude-0/proto/SKEL --steps "wait:2,right:1,shot"
  grep -rl 'STUB (W0 SKEL)' src | wc -l   # equals the stub count in §1.3
  ```

### W1 — Foundation: engines, hooks, APIs, data ids, platform core

| key | title | size | depends on |
|---|---|---|---|
| **PLAT-INPUT** | Input core: device modes, bindings/presets, sticks and triggers, hot-plug, prompts/glyphs, haptics | L | SKEL, EXT-ACCOUNTS, PLAT-QA |
| **PLAT-TOUCH** | Canvas virtual pad: floating stick, slide/roll, skill/ult/companion buttons, layout editor | L | SKEL, PLAT-QA |
| **PLAT-CORE** | Platform core (game.js): safe-area fit, UI scale, pixel budget, pacing, sole pad visibility, flash/vignette/toast policy, pop guard | L | SKEL, EXT-QAFIX, PLAT-QA, FONTS-FU |
| **PLAT-BOOT** | Boot and platform shell: platform.js (insets, fullscreen, wake lock, cursor, SW registration/update), boot gate/progress/error, main.js, index.html, css, manifest, icons | L | SKEL, PLAT-QA, EXT-FONTS, EXT-ACCOUNTS |
| **PLAT-SAVE-ASSETS** | Settings schema v2 with migration, lo/ asset variants and decoded-image LRU | M | SKEL, EXT-ACCOUNTS, EXT-ARTBAKEOFF |
| **PLAT-QA** | Platform QA harness (promote the audit prototypes) | M | SKEL, EXT-ACCOUNTS |
| **FONTS-FU** | Fonts follow-ups: brush and damage faces, fontEpoch, taps registry, text floor, coverage gate | M | SKEL |
| **HUD-LAYOUT** | HUD region allocation and hud.js hooks | M | SKEL |
| **AUDIO-FEEL** | Feel SFX set and audio.js registry API | M | SKEL |
| **FEEL-IMPACT** | Hit feel core: impact(), strength classes, hitstop cap, style meter, damage routing, class perks, multi-part hits | L | SKEL |
| **FEEL-REACT** | Enemy reactions (weights, juggle, knockdown/OTG, bounces, stagger), particle presets/shapes, hit sprite caches | L | SKEL |
| **FEEL-BOSSHOOKS** | Boss hooks after the bake-off: freezeEnemies, boss.telegraph, and the C/D registry merges (bosses/index.js, render/enemies.js) | S | SKEL, EXT-ARTBAKEOFF |
| **WORLD-CAM** | world.js hook points for all features + camera API | L | SKEL, EXT-QAFIX |
| **GAME-HOOKS** | player.js hook lines in canonical order, moveProfile, stats aura hook, save schema v2 + migration | L | SKEL |
| **GIMMICK-ENGINE** | Gimmick framework + mirror, magma, deep, wind; phase tiles; door marks; statue cleanse | L | SKEL, EXT-QAFIX |
| **GIMMICK-KINDS-B** | Gimmick kinds heartbeat, blight, voidwall and the SporePod prop | M | SKEL |
| **GIMMICK-RENDER** | Part 2 themes, weathers, tile styles, decor sets, liquid rendering and the map validator | M | SKEL |
| **P2-DATA** | Part 2 data ids first: enemies, bosses, items (tier 7), docs and lore | L | SKEL |
| **BOSS-P2-KIT** | Part 2 boss helpers (c_common.js) and the boss galleries C/D | M | SKEL, FEEL-BOSSHOOKS, P2-DATA |
| **CMP-DATA** | Companion roster data, state API, migration, bus wiring, recruit API | L | SKEL |
| **ART-ENEMY-SPLIT** | Mechanical split of the two vector enemy render files into five (vector_hd only) | M | SKEL, EXT-ARTBAKEOFF, GATE:ART-DECISION |
| **ART-KIT** | Shared art kit for the chosen approach (TBD; notes: painted) and the per-package registration layer | M | GATE:ART-DECISION, SKEL, EXT-ARTBAKEOFF, PLAT-SAVE-ASSETS |

#### PLAT-INPUT — Input core: device modes, bindings/presets, sticks and triggers, hot-plug, prompts/glyphs, haptics (L)

- **Spec:** platform §3, §4.1–4.7, §5.5 P1, §11 WP-1; feel §2.1 (analogX, analogMag, rumble), §4.12; companions §6 (mount/guard actions); MASTER_PLAN §1.4, §1.11
- **Owns:** `src/core/input.js`, `src/core/prompts.js`, `src/core/haptics.js` (new), `src/data/controls.js` (new)
- **Depends on:** SKEL, EXT-ACCOUNTS, PLAT-QA
- **Provides:** input.mode / onMode / padInfo / stickL / stickR / bindings / touch / setPointerTransform / pollFrame; input.touchMode read-only alias; input.analogX, analogMag, sprintHint, releasedAt(action); input.rumble(strong, weak, ms) → haptics; actions awaken, mount, guard, viewL, viewR, viewReset; map += KeyI; arcade/classic presets, ctrlConfirm, radial deadzone + 8-way sectors, trigger 0.5/0.35, hat decoding; hot-plug toasts + autoPause + bus inputDevice; prompts.bindingOf/drawGlyph/drawHints/legacyKey; haptics.play/rumble/reset (bus subscriptions per §1.11); input.command sector codes, 0.8 s window in touch mode; input.pressTime / releasedAt recorded for every action inside input.update (hitstop-safe, R16); input.command(seq, facingAt, within) → {ok, facing}: f/b evaluated against the facing at the first direction of the sequence (§1.21; fixes d05/d19); menu prevTab = Q/S/LB, nextTab = E/D/RB kept distinct; L3 mount guard (stick < 0.6 or hold ≥ 0.25 s)
- **Consumes:** settings ctrl*/touch* (PLAT-SAVE-ASSETS); touchpad.initTouchPad (PLAT-TOUCH; dynamic import with legacy fallback); game.toast/autoPause
- **Notes:** Keep every existing KEYMAP/PADMAP binding reachable in the classic preset. V becomes 'awaken' (falls back to ult). Menus resolve semantics per device from input.bindings. Keep every legacy input.command caller working: accept a number as facingAt (old signature) and return a truthy object.
- **Tests:**
  ```
  node tools/qa/platform_pad.mjs
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s03" --out /tmp/claude-0/proto/PLAT-INPUT --steps "wait:3,right:1,jump:0.2,attack:0.2,dash:0.1,swap:0.1,shot"
  ```

#### PLAT-TOUCH — Canvas virtual pad: floating stick, slide/roll, skill/ult/companion buttons, layout editor (L)

- **Spec:** platform §5.1–5.5, §11 WP-2; companions §6 (탑승/수호 as canvas buttons); feel §3.1 (touch sprint ring), §6.1 (ult hold ring); MASTER_PLAN §1.4 touch layout
- **Owns:** `src/core/touchpad.js`, `css/touchpad.css` (new)
- **Depends on:** SKEL, PLAT-QA
- **Provides:** initTouchPad(input), touchpad.setVisible(bool), openEditor/closeEditor; #tpad event layer + #tpadcv overlay canvas (≤ 30 Hz redraw); buttons per §1.4 incl. mount/guard (auto-shown from world.companions.hudInfo()) and ult hold ring (world.awakenState); floating stick → input.touch.axis + sprintHint (≥ 1.15 R, re-anchor at 1.4 R); settings.touchLayout persistence, tablet band layout, left-handed mirror; touchpad.occupiedRects() and stickZone() in logical px (HUD matrix, clearStickAtSpawn); scene flag padHideButtons (hub combat buttons); swap fires on release (< 350 ms) in touch mode so a long-press can open the technique radial; #tpadcv backing DPR capped like the game canvas; redraw only on change, ≤ 30 Hz
- **Consumes:** input.touch API (PLAT-INPUT); world.player skill data (read-only); world.companions?.hudInfo?.() (CMP-SYS); world.awakenState (AWAKEN-CORE); game.safe (PLAT-CORE)
- **Notes:** Removes the legacy #touch DOM at init; visibility only through setVisible(), which game.syncPad calls.
- **Tests:**
  ```
  node tools/qa/platform_touch.mjs
  node tools/integration.mjs --mobile
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s01" --out /tmp/claude-0/proto/PLAT-TOUCH --steps "wait:2,right:1,attack:0.2,jump:0.2,shot" --mobile
  node tools/qa/platform_touch.mjs --layout   # 10 buttons incl. mount/guard: gaps ≥ 12 px, ≥ 44 CSS px, inside the safe rect, at size classes S/M/L and touchScale 0.8/1.3
  ```

#### PLAT-CORE — Platform core (game.js): safe-area fit, UI scale, pixel budget, pacing, sole pad visibility, flash/vignette/toast policy, pop guard (L)

- **Spec:** platform §6.1–6.6, §6.7 boot progress, §9.3 SW registration + update hooks, P-18/P-21…P-27/P-30/P-35, §11 WP-3; feel §4.9 flash policy + vignette; companions §12.3 main.js hooks; integration notes: favicon link, toasts over menus, main.js await fontsReady; MASTER_PLAN §1.8 toast anchor, §1.10
- **Owns:** `src/core/game.js`, `src/scenes/stage.js`
- **Depends on:** SKEL, EXT-QAFIX, PLAT-QA, FONTS-FU
- **Provides:** game.safe (from platform.safeInsets), cssScale, uiK/uiW/uiH, scene.uiScale rendering + pointer transform + ui text floor; game.dirty, fpsCap render skipping, pixel budget, symmetric quality governor; game.syncPad as the only pad visibility owner (+ padHideButtons pass-through); game.flash policy (cap 0.7, flashFx, rate limit), game.vignette(); toast policy: FONT.body, hudLayout().toast(i) rows, wrap to 2 lines; pop() guard → title; input.pollFrame() per rAF; stage.js: map → push('menu', {tab:'inventory'})
- **Consumes:** input (PLAT-INPUT); touchpad (PLAT-TOUCH); hudLayout (HUD-LAYOUT); ui.setTextFloor (FONTS-FU, dependency: named import); platform.safeInsets (PLAT-BOOT; W0 stub)
- **Notes:** Rebase on the QA-fix toastX/toastUp change; keep the existing game.syncPad name. Split from v1.0 PLAT-CORE (which bundled 10 files and ~20 deliverables, an XL): boot, platform.js, main.js, index.html and css moved to PLAT-BOOT.
- **Tests:**
  ```
  node tools/qa/platform_view.mjs
  node tools/integration.mjs
  node tools/integration.mjs --mobile
  ```

#### PLAT-BOOT — Boot and platform shell: platform.js (insets, fullscreen, wake lock, cursor, SW registration/update), boot gate/progress/error, main.js, index.html, css, manifest, icons (L)

- **Spec:** platform §6.1 (insets probe), §6.6, §6.7 boot progress/error, §9.3 SW registration + update hooks + manifest, P-21/P-22/P-27/P-30/P-35; companions §12.3 main.js hooks; integration notes: favicon link, main.js await fontsReady; MASTER_PLAN §1.10
- **Owns:** `src/core/platform.js`, `src/boot-gate.js` (new), `src/main.js`, `index.html`, `css/style.css`, `manifest.webmanifest`, `assets/ui/**`, `tools/assets/make_ui_icons.py` (new)
- **Depends on:** SKEL, PLAT-QA, EXT-FONTS, EXT-ACCOUNTS
- **Provides:** platform.safeInsets() (env() probe ⊕ __BN_INSETS + bn-insets event), initPlatform(game), onUpdateReady(cb), isStandalone(); fullscreen (Android web, desktop Alt+Enter), orientation lock, wake lock, cursor hide, audio-unlock hint flag; boot gate (classic script), boot progress bar and boot error screen; SW registration (localhost too unless ?nosw) and the waiting-worker hand-off; inline scripts moved out of index.html (CSP script-src self); main.js: await fontsReady, initCompanions(game), applyCompanionDebug; favicon, iOS meta, 180 px and maskable icons, manifest id/scope/categories/screenshots
- **Consumes:** game.dirty and scene flags (PLAT-CORE); companion_events (CMP-DATA; W0 stub); ui.fontsReady (EXT-FONTS)
- **Notes:** Do not touch the @font-face block in style.css (EXT-FONTS). tools/artifact/blood_nocturne.html is no longer hand-synced: DELIVERY-WEB generates the artifact page from index.html.
- **Tests:**
  ```
  node tools/qa/platform_view.mjs --only boot,insets,pwa
  node tools/integration.mjs --only title,hub
  node tools/integration.mjs --mobile --only title
  ```

#### PLAT-SAVE-ASSETS — Settings schema v2 with migration, lo/ asset variants and decoded-image LRU (M)

- **Spec:** platform §10, §6.4 (quality 'auto'), §6.7 (lo/ selection, LRU), P-13, P-25; feel §7; MASTER_PLAN §1.5
- **Owns:** `src/core/save.js`, `src/core/assets.js`, `tools/test_settings_v2.mjs` (new)
- **Depends on:** SKEL, EXT-ACCOUNTS, EXT-ARTBAKEOFF
- **Provides:** DEFAULT_SETTINGS with every key in §1.5; settingsVersion 2 migration in saves.loadSettings(); assets.url() picks assets/lo/ per §6.4 and falls back on error; decoded-bytes LRU (160 MB touch / 400 MB desktop); assets.has(key); assets.usePack(url) / pack-aware url(), json() and has() (artifact asset packs, §1.20); keeps the bake-off's puppet loader (ext puppets, url(key, ver), json()); painted atlases counted in the decoded LRU (§5.2 texture budget)
- **Consumes:** game.settings consumers
- **Notes:** Keep the accounts' hooks in save.js intact (EXT-ACCOUNTS). The bake-off edited assets.js (puppet loader, commit d0347c9 era): rebase on it, never overwrite it.
- **Tests:**
  ```
  node tools/test_settings_v2.mjs
  node tools/integration.mjs
  ```

#### PLAT-QA — Platform QA harness (promote the audit prototypes) (M)

- **Spec:** platform §11 WP-10, §12
- **Owns:** `tools/qa/**`, `package.json`
- **Depends on:** SKEL, EXT-ACCOUNTS
- **Provides:** tools/qa/lib/{server,viewports,fakepad,touch,taps,safearea,net}.mjs; tools/qa/platform_pad|touch|view|menu|load|pwa.mjs; tools/qa/run_platform.mjs; npm scripts qa:platform (package.json); tools/qa/lib/touch.mjs drives the canvas pad (#tpad) by button id, used by FEEL-QA A7 and CMP-QA; tools/qa/lib/viewports.mjs exports phone1/phone2/tablet logical sizes (vw 1168/1110/960)
- **Notes:** Promotes tools/.proto_specPlatform/*.mjs; reports to /tmp/claude-0/qa/platform/. Keep package.json's existing scripts (accounts).
- **Tests:**
  ```
  node tools/qa/run_platform.mjs   # red today exactly on P-01, P-02, P-03/P-04, P-05, P-06, P-07, P-11, P-12
  ```

#### FONTS-FU — Fonts follow-ups: brush and damage faces, fontEpoch, taps registry, text floor, coverage gate (M)

- **Spec:** platform §8 (usage rules, budget, coverage gate, P-28), §6.2 text floor, §6.3 ui.taps; feel §2.1 (FONT.brush, FONT.dmg); integration notes (lining figures for small numbers)
- **Owns:** `src/core/ui.js`, `assets/fonts/**`, `tools/fonts/**`
- **Depends on:** SKEL
- **Provides:** FONT.brush (lazily loaded brush face via FontFace, fallback FONT.title); FONT.dmg (clear lining digits); ui.fontEpoch (increments on document.fonts loadingdone); ui.taps registry (add/hit/slop/debug draw); ui.setTextFloor(n); build_fonts.py --check scanning all of src/** (new modules included)
- **Notes:** The brush face is registered through the FontFace API in ui.js (no CSS edit). First-frame fonts stay ≤ 500 KB; the brush file is lazy.
- **Tests:**
  ```
  python3 tools/fonts/build_fonts.py --check
  node tools/integration.mjs --only title
  node tools/smoke.mjs --url "index.html" --out /tmp/claude-0/proto/FONTS-FU --steps "wait:2,shot"
  ```

#### HUD-LAYOUT — HUD region allocation and hud.js hooks (M)

- **Spec:** MASTER_PLAN §1.8; feel §4.10 + §6.1 gauge + §9 WP3 (hud.js edits); companions §7.1 (one call); world2 §0 HUD rule; platform §4.5 HUD glyphs, §6.1 safe margins; fonts follow-up: stage title card bloodText
- **Owns:** `src/render/hud.js`, `src/render/hud_layout.js`, `tools/test_hud_layout.mjs` (new)
- **Depends on:** SKEL
- **Provides:** hudLayout(world, vw, vh, pad) → the §1.8 v1.1 rects, meter(i), toast(i), transient slot, top/bottom boss slot from pad rects; hud.js: early return on world.hudHidden; calls drawComboHUD/drawAnnouncer/drawAwGauge (legacy combo block kept while they return false) and drawCompanionHUD; skill labels via prompts.drawGlyph, page hint '[swap] 페이지 n/2'; bloodText stage card; safe-area margins for safeArea 'full'
- **Consumes:** prompts (PLAT-INPUT); game.safe (PLAT-CORE); feel_hud (FEEL-HUD); companion_hud (CMP-UI); touchpad.occupiedRects (PLAT-TOUCH; W0 stub returns [])
- **Tests:**
  ```
  node tools/test_hud_layout.mjs   # desk960, desk1280, phone1 (vw 1168) and phone2 (vw 1110) with pad rects, tablet, touch1280; boss on/off; 0–3 meters; 3 toasts; insets 47/47/0/21
  node tools/integration.mjs --only s04,s04_boss
  node tools/integration.mjs --mobile --only s04,s04_boss
  ```

#### AUDIO-FEEL — Feel SFX set and audio.js registry API (M)

- **Spec:** feel §4.11, §9 WP6; companions §10 (defineSfx, SFX_KIT); MASTER_PLAN §1.9
- **Owns:** `src/core/audio.js`, `src/core/sfx_feel.js` (new), `tools/test_sfx.mjs` (new)
- **Depends on:** SKEL
- **Provides:** FEEL_SFX (45 names) merged into SFX; def.fn(S, H) helper argument; export defineSfx(name, def, vol), export SFX_KIT; tools/test_sfx.mjs plays every registered name headless
- **Notes:** sfx_feel.js must not import audio.js (cycle).
- **Tests:**
  ```
  node tools/test_sfx.mjs
  node tools/integration.mjs --only title,s01
  ```

#### FEEL-IMPACT — Hit feel core: impact(), strength classes, hitstop cap, style meter, damage routing, class perks, multi-part hits (L)

- **Spec:** feel §4.1, §4.6, §4.8 (routing), §4.10, §6.1 AW_GAIN data, §9 WP2 (impact.js, style.js, feel_hit.js, combat.js); companions §5, §12.3 combat dmgColor; platform §4.6 (bus hitCrit/hitHeavy); integration notes: Executioner / Phantom / Night Raven / Warlord perks; boss multi-hitbox
- **Owns:** `src/game/impact.js` (new), `src/game/style.js`, `src/data/feel_hit.js`, `src/game/combat.js`
- **Depends on:** SKEL
- **Provides:** preImpact()/impact() (counter, back attack, capFn, strength class, hitstop with rolling cap, camera kick/trauma, rumble, sprite + material + element + decal, damage number, callouts); class Style (world.style) with ranks/announcer queue/events; tables HITSTOP, HS_CAP, WEIGHT, JUGGLE, DOWN, BOUNCE, MATERIAL, DMG_STYLE, STYLE, AW_GAIN, RUMBLE, BUDGET; playerStrike honors target.hitParts?.() (per-part rect, defMul, onHit); attack.dmgColor; class perks in computeDamage/hitTarget; bus hitCrit, hitHeavy
- **Consumes:** hitfx + fx.dmg (FEEL-REACT); camera.kick/addTrauma (WORLD-CAM); input.rumble (PLAT-INPUT); world.freezeLog/frozenRecent (WORLD-CAM)
- **Notes:** Player-hurt rumble is NOT fired here (haptics.js handles playerHurt).
- **Tests:**
  ```
  node tools/integration.mjs --only s04,s04_boss,s05
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04" --out /tmp/claude-0/proto/FEEL-IMPACT --steps "wait:3,right:1,attack:0.15,attack:0.15,attack:0.15,shot"
  ```

#### FEEL-REACT — Enemy reactions (weights, juggle, knockdown/OTG, bounces, stagger), particle presets/shapes, hit sprite caches (L)

- **Spec:** feel §4.2–4.5, §4.7, §4.8 atlas, §9 WP2 (enemy.js, particles.js, hitfx.js); MASTER_PLAN §1.14
- **Owns:** `src/game/enemy.js`, `src/core/particles.js`, `src/render/hitfx.js`
- **Depends on:** SKEL
- **Provides:** enemy fields wclass, jn, down, otg, wakeInv, stagger, wbArmed, gbArmed, hsShake, react; juggle gravity, guard fall, knockdown, OTG, wake-up, wall/ground bounce, stagger meter; Enemy skips AI while world.freezeEnemies; reaction transforms in Enemy.draw before drawEnemy; particle presets ecto/paper/gravel/goo/bloodmist/feather; shapes sprite/decal/streak/ering/dmg/callout; fx.clearDecals(); fx.dmg(); hitfx: glow/star/cut/streak/ring caches, digitAtlas (after fonts), materialBurst, stampDecal
- **Consumes:** FONT.dmg (FONTS-FU); world.freezeEnemies (WORLD-CAM)
- **Notes:** The boss-side lines (freeze, telegraph) are in FEEL-BOSSHOOKS because boss.js/a_common.js/b_common.js may be touched by the bake-off.
- **Tests:**
  ```
  node tools/integration.mjs --only s02,s05,s09
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s02" --out /tmp/claude-0/proto/FEEL-REACT --steps "wait:3,right:1,attack:0.15,attack:0.15,up:0.1,attack:0.2,shot"
  ```

#### FEEL-BOSSHOOKS — Boss hooks after the bake-off: freezeEnemies, boss.telegraph, and the C/D registry merges (bosses/index.js, render/enemies.js) (S)

- **Spec:** feel §2.1 (bosses row), §4.6 (telegraph counters); MASTER_PLAN §1.14
- **Owns:** `src/game/bosses/boss.js`, `src/game/bosses/a_common.js`, `src/game/bosses/b_common.js`, `src/game/bosses/index.js`, `src/render/enemies.js`
- **Depends on:** SKEL, EXT-ARTBAKEOFF
- **Provides:** Boss/BossA/BossB skip AI and their own attack timers while world.freezeEnemies (like timeStop, without the grey overlay); boss.telegraph = true during warn/windup helpers; BOSS_CLASSES merges BOSS_C/BOSS_D; ENEMY_RENDER merges RENDER_C/RENDER_D (moved here from ART-KIT so Part 2 gameplay does not wait for GATE:ART-DECISION)
- **Consumes:** world.freezeEnemies (WORLD-CAM)
- **Notes:** Only these hook/merge lines; no drawing changes. Rebase on the bake-off's paintedTick/paintedDraw/preloadPainted lines in a_common.js/b_common.js and the painted draw/preload in render/enemies.js (already in the tree).
- **Tests:**
  ```
  node tools/integration.mjs --only s01_boss,s07_boss,s12_boss
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&room=boss" --out /tmp/claude-0/proto/FEEL-BOSSHOOKS --steps "wait:2.5,right:2.5,wait:4.5,enter:0.1,wait:2,eval=__game.world.freezeEnemies=true,wait:1,shot"
  ```

#### WORLD-CAM — world.js hook points for all features + camera API (L)

- **Spec:** MASTER_PLAN §1.6 world order; feel §4.1 hitstop runtime, §4.9 camera + kill slow-mo, §3.7, §9 WP2 (world.js, camera.js); world2 §3.3 world.js hooks, §3.8, §3.9; companions §12.3 world.js; platform §5.4 touch camera bias; integration notes: arena camera y bias, <bossId>_post scripts
- **Owns:** `src/game/world.js`, `src/core/camera.js`
- **Depends on:** SKEL, EXT-QAFIX
- **Provides:** world fields and every hook call site in §1.7 (world.js table); get liquid(), gimmickOf(kind); star shard / world heart collection + banners + bus shardFound/heartFound; door marks; camera: kick, addTrauma, shake (legacy → trauma), eased punchZoom, zoomPulse, roll, cine/cineEnd/frameOn, lookBoost, touch bias, bus shake (mag ≥ 8), arena y bias; stickRect() via touchpad.stickZone() (logical px) with today's fallback; hook_baseline.json for world.js (R4)
- **Consumes:** Style + AW_GAIN (FEEL-IMPACT); createGimmick (GIMMICK-ENGINE); CompanionSystem (CMP-SYS; stub); fx.clearDecals (FEEL-REACT); touchpad.stickZone (PLAT-TOUCH; W0 stub)
- **Notes:** Every line tagged per R4.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/validate_maps.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&room=boss" --out /tmp/claude-0/proto/WORLD-CAM --steps "wait:2.5,right:2.5,wait:4.5,enter:0.1,wait:1.5,enter:0.1,wait:2,attack:0.2,shot"
  ```

#### GAME-HOOKS — player.js hook lines in canonical order, moveProfile, stats aura hook, save schema v2 + migration (L)

- **Spec:** MASTER_PLAN §1.7 player order, §1.6 save v2; world2 §2.6, §3.3 player.js hooks; companions §12.3 player.js/stats.js/state.js, §8 migration call; feel §9 WP1 hook lines (moveId, buffers), WP5 ult line, §6.1 super armor
- **Owns:** `src/game/player.js`, `src/game/stats.js`, `src/game/state.js`, `tools/fixtures/save_v1.json` (new), `tools/test_save_v2.mjs` (new)
- **Depends on:** SKEL
- **Provides:** all 32 tagged hook lines (no-ops against the stubs), incl. the facing ring p.facingAt(t) and the technique-loop change (§1.21); moveProfile(gait) single movement profile; handleUltInput replaces the ult line; superArmor, awakenHoldK, lastDashEnd fields; makeAttack moveId; buffer compensation with world.frozenRecent; stats: addStats(s, companionAuraStats(state, hero)); SAVE_VERSION 2, progress.shards/hearts, migrateState order incl. migrateCompanions, ensureCompanionState in newGameState; v1 fixture; movement block skipped while mount.chargeT > 0 (hook #5); hook_baseline.json for player.js (R4); ch20 save-size assertion in test_save_v2
- **Consumes:** feel_move stubs; awaken stub; companion_state stubs
- **Notes:** Hooks only: no gameplay change is visible until the owners land (the stubs keep legacy behavior). Coordinate the input.command signature with PLAT-INPUT (both W1): call it through the old signature until PLAT-INPUT lands (it accepts a number).
- **Tests:**
  ```
  node tools/test_save_v2.mjs
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s08" --out /tmp/claude-0/proto/GAME-HOOKS --steps "wait:3,right:1.5,jump:0.3,attack:0.2,dash:0.1,ult:0.1,shot"
  ```

#### GIMMICK-ENGINE — Gimmick framework + mirror, magma, deep, wind; phase tiles; door marks; statue cleanse (L)

- **Spec:** world2 §3.1–3.5 (framework, mirror, magma, deep, wind), §3.3 tilemap/props hunks, §3.4, §3.6, §14 interplay; MASTER_PLAN §1.2 (windMul, airDrainMul)
- **Owns:** `src/game/gimmicks.js`, `src/game/tilemap.js`, `src/game/props.js`
- **Depends on:** SKEL, EXT-QAFIX
- **Provides:** createGimmick, GIMMICK_KINDS, GimmickSet (composite), MirrorSwitch; member APIs mirror/magma/deep/wind; registry for GIMMICKS_B kinds; phase tiles a/b/z/Z in TileMap.phaseTiles; Door.draw 'blood' mark; Statue cleanse before heal; wind × p.mount.def.windMul; deep air drain × world.companions.airDrainMul; mounts treated by AABB
- **Consumes:** world hooks (WORLD-CAM); player hooks (GAME-HOOKS); hudLayout meter rows (HUD-LAYOUT)
- **Notes:** Test with throwaway rooms until the Part 2 maps exist.
- **Tests:**
  ```
  node tools/validate_maps.mjs
  node tools/.proto_GIMMICK-ENGINE/rooms.mjs   # scripted test rooms for each kind (throwaway)
  node tools/integration.mjs --only s01,s08
  ```

#### GIMMICK-KINDS-B — Gimmick kinds heartbeat, blight, voidwall and the SporePod prop (M)

- **Spec:** world2 §3.5 (heartbeat, blight, voidwall, SporePod), §14; MASTER_PLAN §1.2 (blightMul)
- **Owns:** `src/game/gimmicks_b.js`
- **Depends on:** SKEL
- **Provides:** GIMMICKS_B = {heartbeat, blight, voidwall}; SporePod entity; blight gain × p.mount.def.blightMul
- **Consumes:** GimmickSet member interface (GIMMICK-ENGINE)
- **Tests:**
  ```
  node tools/.proto_GIMMICK-KINDS-B/rooms.mjs
  node tools/integration.mjs --only s01
  ```

#### GIMMICK-RENDER — Part 2 themes, weathers, tile styles, decor sets, liquid rendering and the map validator (M)

- **Spec:** world2 §4.1, §3.3 (tiles.js deep palette), §3.7 validator; integration notes: waterfall streaks for vertical liquid; optional secret-area darkening
- **Owns:** `src/render/tiles.js`, `src/render/background.js`, `tools/validate_maps.mjs`
- **Depends on:** SKEL
- **Provides:** THEMES mirror/forge/sunken/sky/nightmare/blight/void; weathers spores/stars; TILE_STYLES, DECOR_SETS, OPEN_SKY_THEMES, DECOR_BLOCK; deep liquid palette; flowing streaks on vertical liquid columns; validator: gimmick params, char rules, phase/swim/updraft BFS, Part 2 stage checks
- **Consumes:** ITEMS/LORE/DOCS/SCRIPTS (P2-DATA, SKEL)
- **Tests:**
  ```
  node tools/validate_maps.mjs   # Part 1 still 0 errors
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s08" --out /tmp/claude-0/proto/GIMMICK-RENDER --steps "wait:3,right:2,shot"
  ```

#### P2-DATA — Part 2 data ids first: enemies, bosses, items (tier 7), docs and lore (L)

- **Spec:** world2 §5.2 (24 enemies incl. desc), §6.2–6.8 boss defs, §7.1–7.5, §8 (d21 cmd per MASTER_PLAN §1.21), §16.4 hour-0
- **Owns:** `src/data/enemies_c.js`, `src/data/enemies_d.js`, `src/data/bosses_c.js`, `src/data/bosses_d.js`, `src/data/items.js`, `src/data/lore.js`
- **Depends on:** SKEL
- **Provides:** ENEMIES_C (s14–s16), ENEMIES_D (s17–s20); BOSSES_C (narkissa, moloch, dagon, ziz), BOSSES_D (mara, behemoth, nihil); tier-7 constants/tables, materials, keys, uniques, mythics, MYTHIC_WEAPONS_P2; DOCS d21–d27, LORE l21–l34, LORE_ORDER, DOC_ORDER; every enemy drop material id exists in ITEMS (integration note); def.noArena on gimmick-dependent enemies (chandelier_fiend, abyss_angler, sunken_priest, coral_crab, siren, cloud_jelly and any enemy whose AI needs a ceiling, deep water, wind or blight) so survival never spawns them (§1.14)
- **Notes:** Numbers exactly as world2; Korean desc verbatim.
- **Tests:**
  ```
  node --input-type=module -e "const {ITEMS}=await import('./src/data/items.js'); const {ENEMIES}=await import('./src/data/enemies.js'); const miss=[]; for (const e of Object.values(ENEMIES)) for (const d of e.drops??[]) { const id=d.item??d.id??d[0]; if (typeof id==='string' && id.startsWith('m_') && !ITEMS[id]) miss.push(e.id+':'+id); } console.log(miss.length?miss:'ok')"
  node tools/validate_maps.mjs
  node tools/integration.mjs --only hub,menu
  ```

#### BOSS-P2-KIT — Part 2 boss helpers (c_common.js) and the boss galleries C/D (M)

- **Spec:** world2 §6.1 (framework, conventions, phase scripts, onReset); MASTER_PLAN §1.13, §1.14
- **Owns:** `src/game/bosses/c_common.js` (new), `tools/gallery_bosses_c.html` (new), `tools/gallery_bosses_d.html` (new)
- **Depends on:** SKEL, FEEL-BOSSHOOKS, P2-DATA
- **Provides:** c_common.js: phase-script deferral while world.cutscene (story mode, once via seenScripts), gimmickOf wrappers with null checks, onReset helpers (walls, magma, water, wind, beat, minions), debugAct/debugPhase conventions, warn/telegraph helpers; gallery_bosses_c/d.html listing every BOSSES_C/BOSSES_D entry with state and phase buttons (debugAct/debugPhase), tolerant of null classes
- **Consumes:** BossB (b_common.js, read-only); BOSSES_C/BOSSES_D (P2-DATA)
- **Notes:** New in v1.1: in v1.0 BOSS-P2-1 owned c_common.js and gallery_bosses_c.html while BOSS-P2-2/3/4 (same wave, no dependency) imported and tested with them; a named import of a helper that did not exist yet is a link-time crash (R6).
- **Tests:**
  ```
  node --input-type=module -e "await import('./src/game/bosses/c_common.js'); console.log('ok')"
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/BOSS-P2-KIT --steps "wait:3,shot"
  ```

#### CMP-DATA — Companion roster data, state API, migration, bus wiring, recruit API (L)

- **Spec:** companions §1–2, §3.4, §3.9, §4.9, §8, §9, §12.1–12.2, §12.5, §13 (lines); world2 §2.4, §14; MASTER_PLAN §1.2 (ids, names, P2 stats)
- **Owns:** `src/data/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `tools/test_companion_state.mjs` (new), `tools/fixtures/save_ch6_nocmp.json` (new)
- **Depends on:** SKEL
- **Provides:** 20 companions with the §1.2 ids, names, portraits, cries and numbers; formulas cexpToNext, guardianShare, trampleRatio, cdMul, BOND_RANKS/NAMES; state API companions §12.2; migrateCompanions / ensureCompanionState (idempotent, never throws); obtain type 'flag' for recruit_<id>; retro unlocks; initCompanions(game) sets game.companions = {recruit, unlock}; applyCompanionDebug(state, params)
- **Notes:** Pure data/state (Node-importable, imports only data and core/events.js).
- **Tests:**
  ```
  node tools/test_companion_state.mjs
  ```

#### ART-ENEMY-SPLIT — Mechanical split of the two vector enemy render files into five (vector_hd only) (M)

- **Spec:** MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a.js`, `src/render/enemies_a2.js` (new), `src/render/enemies_b.js`, `src/render/enemies_b2.js` (new), `src/render/enemies_b3.js` (new), `src/render/enemies_shared.js` (new)
- **Depends on:** SKEL, EXT-ARTBAKEOFF, GATE:ART-DECISION
- **Provides:** one vector file per ART-ENEMY package (lists in §1.15); RENDER_A, RENDER_B, PROJ_B, ZONE_B exported unchanged; shared helpers in enemies_shared.js
- **Notes:** No drawing change. Skipped (recorded done) when the gate picks painted: painted renderers are new files and the vector files stay untouched as the fallback.
- **Tests:**
  ```
  node tools/.proto_ART-ENEMY-SPLIT/diff.mjs   # gallery_enemies_a/b screenshots pixel-identical before/after
  node tools/integration.mjs
  ```

#### ART-KIT — Shared art kit for the chosen approach (TBD; notes: painted) and the per-package registration layer (M)

- **Spec:** MASTER_PLAN §1.15; user requests #1/#2; world2 §0 art bar; companions §11 rendering rules
- **Owns:** `src/render/painted/**`, `src/render/art_kit.js` (new), `docs/art/**`, `tools/painted/**`, `tools/puppet/build_*.py`, `tools/puppet/lib/**`, `tools/puppet/ingest.py`, `tools/gallery_artkit.html` (new)
- **Depends on:** GATE:ART-DECISION, SKEL, EXT-ARTBAKEOFF, PLAT-SAVE-ASSETS
- **Provides:** painted: finalized kit.js/registry.js/enemy_kit.js + pipeline docs; registry.js and painted/enemies/index.js become aggregators over src/render/painted/reg/*.js; stubs src/render/painted/reg/<key>.js for every art package (ART-BOSS-1…8, ART-ENEMY-1…5, ENEMY-P2-C-ART, ENEMY-P2-D-ART, CMP-MOUNT-ART-A/B, CMP-GUARD-ART-A/B) plus reg/npcs.js (ART-NPC); per-package prompt files tools/painted/prompts/<key>.mjs and manifests tools/kling/manifest_<key>.json replace the shared tools/painted/enemies/prompts.mjs, genlog.json and tools/puppet/kling_manifest.json; kit loads through assets.js (packs, lo/, decoded LRU) and enforces the per-scene texture budget; two-layer (back/front) draw for mounts; vector_hd: art_kit.js (cached gradients, rim light, outline, glow sprites, cloth helpers); renderer contract and per-draw budget test (gallery perf loop)
- **Notes:** Takes over the bake-off's painted runtime and shared tools once GATE:ART-DECISION is published and keeps only the chosen approach. It no longer owns render/enemies.js or bosses/index.js (FEEL-BOSSHOOKS). v1.0 left registry.js and painted/enemies/index.js frozen in W2 although every painted package must register its creatures there.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/.proto_ART-KIT/perf.mjs   # per-draw cost vs today's renderers
  node tools/.proto_ART-KIT/painted_registry.mjs   # every reg/*.js imports in Node and every id resolves to files (QA-TOOLS promotes it to tools/qa/ in W3)
  ```

### W2 — Features, content and art

| key | title | size | depends on |
|---|---|---|---|
| **FEEL-MOVE** | Movement feel: gaits, sprint, skid/pivot/run start, heavy landing, foot-locked footsteps, dash FX, squash | L | GAME-HOOKS, PLAT-INPUT, WORLD-CAM, AUDIO-FEEL |
| **FEEL-HUD** | Combo/style HUD, announcer, awakening gauge and ready text | M | FEEL-IMPACT, HUD-LAYOUT, FONTS-FU |
| **FX-ULTKIT** | Ultimate/awakening layer kit, tier escalation and the 24 class flourishes | L | WORLD-CAM, FEEL-REACT |
| **FX-ULTS** | Per-hero ultimate overhaul in skills.js, castUltimate tiers, FXKIT export | L | WORLD-CAM, FEEL-IMPACT, FEEL-REACT |
| **OVERLAYS** | overlays.js: ult cut-in upgrade, bloodText titles, pause/gameover routing | M | FONTS-FU, PLAT-INPUT, PLAT-CORE, EXT-QAFIX |
| **AWAKEN-CORE** | Awakening rules, hold logic, cut-in scene, awakening data, boss cap | L | GAME-HOOKS, FEEL-IMPACT, WORLD-CAM, FONTS-FU, AUDIO-FEEL, EXT-CUTIN-ART |
| **AWAKEN-DIR-A** | Awakening directors: Kael, Sera, Victor (+ T2 variants) | L | AWAKEN-CORE, FX-ULTS, FX-ULTKIT |
| **AWAKEN-DIR-B** | Awakening directors: Bran, Lia, Azel (+ T2 variants) | L | AWAKEN-CORE, FX-ULTS, FX-ULTKIT |
| **AUDIO-CMP** | Companion SFX (26 + 5 Part 2 cries) | M | AUDIO-FEEL |
| **CMP-SYS** | CompanionSystem runtime, guardian entity, 6 guardian AIs (아리아 … 미네르바), resonance, hub enter | L | CMP-DATA, WORLD-CAM, GAME-HOOKS, FEEL-IMPACT |
| **CMP-GUARD-AI-B** | Guardian AIs: 틱톡, 모르스, 미라, 루멘, 모모 | M | CMP-SYS |
| **CMP-MOUNT** | MountRider runtime + the 6 Part 1 mounts | L | CMP-DATA, GAME-HOOKS, WORLD-CAM |
| **CMP-MOUNT-B** | Part 2 mounts: 이그니스, 게일, 실바 (charges, specials, passives) | M | CMP-MOUNT |
| **CMP-MOUNT-ART-A** | Mount rig and renderers: horse/boar templates — 그림메인, 바르그, 코슈타, 이그니스, 실바 | XL | ART-KIT, CMP-DATA |
| **CMP-MOUNT-ART-B** | Mount renderers: wolf, wyvern, bat, griffin — 스콜, 스칼렛, 녹티스, 게일 | XL | CMP-MOUNT-ART-A |
| **CMP-GUARD-ART-A** | Guardian renderers + FX helpers: 아리아, 하티, 핌, 가웨인, 크론, 미네르바 | L | ART-KIT, CMP-DATA |
| **CMP-GUARD-ART-B** | Guardian renderers: 틱톡, 모르스, 미라, 루멘, 모모 | L | CMP-GUARD-ART-A |
| **CMP-UI** | Companion HUD widgets and call-outs, 동료 menu tab, join reveal scene | L | CMP-DATA, HUD-LAYOUT, PLAT-INPUT, FONTS-FU |
| **CMP-TOWN** | Stable of Souls: town extension, Greta, facade, stable scene, companion scripts | L | CMP-DATA, EXT-QAFIX |
| **PLAT-MENU** | Menu system for touch, pad and scale (scroll fix, swipe, long-press, glyphs) + 동료 tab row | L | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS, PLAT-QA |
| **PLAT-TURNTABLE** | Hero turntable in status/equip/class tabs (interaction + interim fallback) | L | PLAT-INPUT, PLAT-CORE, PLAT-QA |
| **PLAT-FRONT-A** | Front scenes for touch/pad/scale + title features (title, common, slots, difficulty, charselect, highscore, dialogs) | L | PLAT-INPUT, PLAT-CORE, PLAT-BOOT, FONTS-FU, PLAT-QA, EXT-ACCOUNTS, EXT-QAFIX |
| **PLAT-FRONT-B** | Arcade front scenes: Part 2 courses/presets and survival fixes (arcade.js, arcade_run.js) | M | PLAT-INPUT, PLAT-CORE, FONTS-FU, P2-DATA, EXT-QAFIX |
| **PLAT-ACCOUNT-UI** | Account and cloud-save screens adopt the platform UI rules | S | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS |
| **PLAT-OPTIONS** | Options pages, pad/keyboard remap screens, generated controls guide | L | PLAT-INPUT, PLAT-CORE, PLAT-SAVE-ASSETS, PLAT-TOUCH, PLAT-QA |
| **PLAT-TOWN** | Town scenes for touch/pad/scale + hub hooks (quick inventory, companions, optional sky crack) | L | PLAT-INPUT, PLAT-CORE, CMP-DATA, EXT-QAFIX, PLAT-QA |
| **PLAT-GAMES** | Minigames for touch/pad/scale (+ JACKPOT bloodText) | L | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-QAFIX, PLAT-QA |
| **PLAT-DIALOG** | Pause, dialogue and results for touch/pad/scale + recruit cmd + s20 ending route | M | PLAT-INPUT, PLAT-CORE, FONTS-FU, PLAT-QA, EXT-QAFIX |
| **DELIVERY-WEB** | Web delivery tooling: allowlist build, Netlify config, service worker, asset variants | L | PLAT-CORE, EXT-ACCOUNTS, PLAT-QA, PLAT-BOOT, PLAT-SAVE-ASSETS |
| **MAPS-P2-A** | Maps s14–s15 and the stages.js ownership for Part 2 | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **MAPS-P2-B** | Maps s16–s17 | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **MAPS-P2-C** | Maps s18–s19 | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **MAPS-P2-D** | Map s20 (void wall, remix rooms, l33/l34 placement) | M | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **ENEMY-P2-C-AI** | Part 2 enemy AI kinds for s14–s16 (+ data tuning) | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT |
| **ENEMY-P2-C-ART** | Part 2 enemy renderers s14–s16 (12) | XL | ART-KIT, P2-DATA |
| **ENEMY-P2-D-AI** | Part 2 enemy AI kinds for s17–s20 (+ data tuning) | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT |
| **ENEMY-P2-D-ART** | Part 2 enemy renderers s17–s20 (12) | XL | ART-KIT, P2-DATA |
| **BOSS-P2-1** | Bosses 나르키사 and 몰록 (+ boss data C) | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT |
| **BOSS-P2-2** | Bosses 다곤 and 지즈 | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT |
| **BOSS-P2-3** | Bosses 마라 and 베헤모스 (+ boss data D) | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT |
| **BOSS-P2-4** | Final boss 니힐 | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT |
| **STORY-P2-A** | Part 2 story A: prologue, chapters 14–17, endings, credits, story/ending scene changes | L | SKEL, FONTS-FU, PLAT-INPUT, PLAT-CORE, EXT-QAFIX |
| **STORY-P2-B** | Part 2 story B: chapters 18–20, NPC chapter lines, quest dialogues | L | SKEL |
| **ITEMS-P2** | Part 2 techniques, quests (incl. Greta's), shop, loot, icons; item text polish | L | P2-DATA, SKEL |
| **WORLDMAP-P2** | World map page 2, reveals, legacy-save prologue, map UI for touch/pad/scale | L | P2-DATA, PLAT-INPUT, PLAT-CORE, EXT-QAFIX |
| **ART-HERO-A** | Hero renderer integration: puppet/vector dispatch, detail, gait/feel hooks, rider pose, equipment visuals, NPC dispatch (approach TBD; notes: painted) | L | ART-KIT, GATE:ART-DECISION, FEEL-MOVE |
| **ART-HERO-ASSETS-1** | Hero puppet assets: sera, victor (7 classes each; painted only) | XL | ART-KIT, GATE:ART-DECISION |
| **ART-HERO-ASSETS-2** | Hero puppet assets: bran, lia (7 classes each; painted only) | XL | ART-KIT, GATE:ART-DECISION |
| **ART-HERO-ASSETS-3** | Hero puppet assets: azel (7 classes each; painted only) | XL | ART-KIT, GATE:ART-DECISION |
| **ART-NPC** | NPC puppets (7 NPCs incl. Greta and Rook's Part 2 look) and the NPC registry | L | ART-KIT, GATE:ART-DECISION |
| **ART-BOSS-1** | Boss art: 나이트윙, 밴시 여왕, 둘라한 (drawing only; approach TBD) | XL | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-2** | Boss art: 진홍의 갑주군주, 본 드래곤, 그리모어 (approach TBD) | XL | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-3** | Boss art: 키메라 호문쿨루스, 레비아탄, 태엽 거신 (approach TBD) | XL | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-4** | Boss art: 서리 여왕 이자벨라, 사신 데스 (approach TBD) | XL | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-5** | Boss art: 드라큘라 백작 (both forms), 혼돈의 군주 (approach TBD) | XL | ART-KIT, FEEL-BOSSHOOKS |
| **ART-ENEMY-1** | Enemy art: common + s01–s03 (19) (approach TBD) | XL | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-2** | Enemy art: s04–s06 (15) (approach TBD) | XL | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-3** | Enemy art: s07–s09 (14) + PROJ_B/ZONE_B (approach TBD) | XL | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-4** | Enemy art: s10–s11 (10) (approach TBD) | XL | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-5** | Enemy art: s12–s13 (9) (approach TBD) | XL | ART-KIT, ART-ENEMY-SPLIT |

#### FEEL-MOVE — Movement feel: gaits, sprint, skid/pivot/run start, heavy landing, foot-locked footsteps, dash FX, squash (L)

- **Spec:** feel §3 (all), §9 WP1; companions §15 (single movement profile); world2 §3.3 (speedMul composition); MASTER_PLAN §1.4 sprint/command precedence, §1.9 Part 2 surfaces
- **Owns:** `src/game/player.js`, `src/game/feel_move.js`, `src/data/feel_move.js`, `src/render/hero_gait.js`
- **Depends on:** GAME-HOOKS, PLAT-INPUT, WORLD-CAM, AUDIO-FEEL
- **Provides:** updateGait/onJump/onLand/dashFx/squashSpring; p.gait, gaitPh, moveFx, sprinting, feel {sq, sqV, accLean}; hero_gait.js gaitPose/applyFeelOverlay/GAIT_ANIMS; footstep events by surface (incl. Part 2); stepT block removed; new updateAnim priority
- **Consumes:** input.analogX/sprintHint/releasedAt; camera.kick/lookBoost/zoomTarget; sfx step_*; p.mount?.riding (skip gait while riding)
- **Notes:** Keep every [hook:*] line from GAME-HOOKS. Base run speed, jump height and dash distance unchanged (feel M1). Visual hook in hero.js is ART-HERO-A's.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04" --out /tmp/claude-0/proto/FEEL-MOVE --steps "wait:3,right:0.1,wait:0.1,right:1.2,wait:0.3,left:0.3,jump:0.4,shot"
  ```

#### FEEL-HUD — Combo/style HUD, announcer, awakening gauge and ready text (M)

- **Spec:** feel §4.10 HUD, §6.1 gauge UI, §9 WP3 (feel_hud.js); MASTER_PLAN §1.8
- **Owns:** `src/render/feel_hud.js`
- **Depends on:** FEEL-IMPACT, HUD-LAYOUT, FONTS-FU
- **Provides:** drawComboHUD, drawAnnouncer (queue 2, suppressed by banner), drawAwGauge (+ device-aware ready text); brush banner sprite cache
- **Consumes:** world.style (FEEL-IMPACT); world.run.aw, world.awakenState; hudLayout; prompts.drawGlyph
- **Tests:**
  ```
  node tools/test_hud_layout.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04" --out /tmp/claude-0/proto/FEEL-HUD --steps "wait:3,right:1,attack:0.15,attack:0.15,attack:0.15,attack:0.15,shot"
  ```

#### FX-ULTKIT — Ultimate/awakening layer kit, tier escalation and the 24 class flourishes (L)

- **Spec:** feel §5.1, §5.2, §8 budgets
- **Owns:** `src/render/ultfx.js`
- **Depends on:** WORLD-CAM, FEEL-REACT
- **Provides:** ULTFX.begin/beat/final/afterimage/end; tier table T0/T1/T2; 24 T2 flourish recipes; cached sprites only (no per-frame gradients)
- **Consumes:** camera zoomPulse/roll/cine; world.overlays; hitfx caches
- **Tests:**
  ```
  node tools/.proto_FX-ULTKIT/tiers.mjs   # renders each tier + flourish to PNG
  node tools/integration.mjs --only s04
  ```

#### FX-ULTS — Per-hero ultimate overhaul in skills.js, castUltimate tiers, FXKIT export (L)

- **Spec:** feel §5.3, §9 WP4 (skills.js part); companions §3.6.4, §4.7 (hooks already present); platform §4.6 (ultimateCast)
- **Owns:** `src/game/skills.js`
- **Depends on:** WORLD-CAM, FEEL-IMPACT, FEEL-REACT
- **Provides:** castUltimate(p, world) passes {tier, accent, classId}; flash via policy; ultDirector ULTFX.begin/end; ultFinal → ULTFX.final with final:true (class S); ULTS.kael…azel changes; export FXKIT (existing helpers only); fills the W0 placeholder FXKIT export in skills.js
- **Consumes:** ULTFX (FX-ULTKIT); ultCutin scene (OVERLAYS)
- **Notes:** Keep SKEL's hook lines (SKILL_IMPL_P2 merge, beforeCast, ultimateCast).
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&char=kael" --out /tmp/claude-0/proto/FX-ULTS --steps "wait:3,eval=__game.world.run.sp=100,ult:0.1,wait:2.5,shot"
  ```

#### OVERLAYS — overlays.js: ult cut-in upgrade, bloodText titles, pause/gameover routing (M)

- **Spec:** feel §5.3 (UltCutinScene); fonts follow-ups (boss intro, WARNING, GAME OVER); integration notes (pause/gameover hub {from: w.stage.id}); platform §6.2/§4.5 for gameover/document scenes
- **Owns:** `src/scenes/overlays.js`
- **Depends on:** FONTS-FU, PLAT-INPUT, PLAT-CORE, EXT-QAFIX
- **Provides:** UltCutinScene 0.9 s, two stripes, brush title, gold border at T2, deferToasts + hidePad; bloodText in BossIntro/WARNING/GameOver; uiScale + glyph hints in GameOver/Document
- **Consumes:** FONT.brush; prompts
- **Tests:**
  ```
  node tools/integration.mjs --only s01_boss,s04_boss,s12_boss
  ```

#### AWAKEN-CORE — Awakening rules, hold logic, cut-in scene, awakening data, boss cap (L)

- **Spec:** feel §6.1–6.3, §6.5, §7; MASTER_PLAN §1.4 (V key, hold), §1.13, §1.14
- **Owns:** `src/game/awaken.js`, `src/data/awaken.js`, `src/scenes/awaken_cutin.js`
- **Depends on:** GAME-HOOKS, FEEL-IMPACT, WORLD-CAM, FONTS-FU, AUDIO-FEEL, EXT-CUTIN-ART
- **Provides:** handleUltInput (tap/hold/cancel, instant 'awaken'), canAwaken, castAwakening; world.awakenState {ready, holdK}, p.awakenHoldK, p.superArmor during the hold; AwakenCutinScene (full/short, skip, baked band, portrait fallback, pre-decode); AWAKEN data for 6 heroes (names, lines, seals, colors, anchors from tools/kling/cutin_anchors.json, T2 table); boss cap 30% via attack.capFn; registerDirector(charId, fn); bus awakenCast; mount beforeCast
- **Consumes:** AWAKEN_DIRECTOR(_B) (AWAKEN-DIR-A/B); FXKIT (FX-ULTS); ULTFX (FX-ULTKIT)
- **Notes:** Import FXKIT from skills.js (W0 placeholder) and treat an empty FXKIT as "director not ready" until FX-ULTS lands. Hold logic per R16: level state + pressTime, cancel on a missed frame or a scene push. EXT-CUTIN-ART is done (anchors in tools/kling/cutin_anchors.json).
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&char=kael" --out /tmp/claude-0/proto/AWAKEN-CORE --steps "wait:3,eval=__game.world.hero.classId='kael_templar';__game.world.run.sp=100;__game.world.run.aw=100,ult:0.6,wait:1,shot,wait:3,shot"
  ```

#### AWAKEN-DIR-A — Awakening directors: Kael, Sera, Victor (+ T2 variants) (L)

- **Spec:** feel §6.4 (Kael, Sera, Victor)
- **Owns:** `src/game/awaken_directors.js`
- **Depends on:** AWAKEN-CORE, FX-ULTS, FX-ULTKIT
- **Provides:** AWAKEN_DIRECTOR.kael/sera/victor with MV weights, 'awaken' tags, class A finals, T2 variants
- **Consumes:** FXKIT, ULTFX, awaken registerDirector
- **Tests:**
  ```
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&char=victor" --out /tmp/claude-0/proto/AWAKEN-DIR-A --steps "wait:3,eval=__game.world.hero.classId='victor_gunlord';__game.world.run.sp=100;__game.world.run.aw=100,ult:0.6,wait:4,shot"
  ```

#### AWAKEN-DIR-B — Awakening directors: Bran, Lia, Azel (+ T2 variants) (L)

- **Spec:** feel §6.4 (Bran, Lia, Azel)
- **Owns:** `src/game/awaken_directors_b.js`
- **Depends on:** AWAKEN-CORE, FX-ULTS, FX-ULTKIT
- **Provides:** AWAKEN_DIRECTOR_B.bran/lia/azel (spectral knights as cached ghost bitmaps)
- **Consumes:** FXKIT, ULTFX, drawHero ghost bitmaps
- **Tests:**
  ```
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&char=lia" --out /tmp/claude-0/proto/AWAKEN-DIR-B --steps "wait:3,eval=__game.world.hero.classId='lia_reaper';__game.world.run.sp=100;__game.world.run.aw=100,ult:0.6,wait:4,shot"
  ```

#### AUDIO-CMP — Companion SFX (26 + 5 Part 2 cries) (M)

- **Spec:** companions §10; MASTER_PLAN §1.9
- **Owns:** `src/core/audio_companions.js`
- **Depends on:** AUDIO-FEEL
- **Provides:** 31 names registered through defineSfx
- **Consumes:** defineSfx, SFX_KIT
- **Tests:**
  ```
  node tools/test_sfx.mjs
  ```

#### CMP-SYS — CompanionSystem runtime, guardian entity, 6 guardian AIs (아리아 … 미네르바), resonance, hub enter (L)

- **Spec:** companions §4.1–4.8, §5, §7.4 (hub enter), §12.4; world2 §14; MASTER_PLAN §1.2, §1.14
- **Owns:** `src/game/companions.js`, `src/game/guardian.js` (new), `tools/test_guardians.mjs` (new)
- **Depends on:** CMP-DATA, WORLD-CAM, GAME-HOOKS, FEEL-IMPACT
- **Provides:** CompanionSystem + CompanionDirector (all §12.4 methods), incoming(), shieldT, airDrainMul, hudInfo(), hudRects taps; Guardian base, gAttack, GUARDIAN_AI for gd_fairy, gd_spiritwolf, gd_imp, gd_knight, gd_whelp, gd_owl; registry for GUARDIAN_AI_B; assist (협공), auto-skill, resonance on ultimateCast/awakenCast after cutscene; exp/bond runtime, touchpad visibility info; companionHubEnter, companionHubNote
- **Consumes:** MountRider (CMP-MOUNT); drawGuardian (CMP-GUARD-ART-A); audio_companions (AUDIO-CMP)
- **Tests:**
  ```
  node tools/test_guardians.mjs
  node tools/integration.mjs --only s05,s11,hub
  ```

#### CMP-GUARD-AI-B — Guardian AIs: 틱톡, 모르스, 미라, 루멘, 모모 (M)

- **Spec:** companions §4.9 (gd_clock, gd_reaper); MASTER_PLAN §1.2 P2 guardian table
- **Owns:** `src/game/guardian_ai_b.js`
- **Depends on:** CMP-SYS
- **Provides:** GUARDIAN_AI_B for gd_clock, gd_reaper, gd_mirra (projectile reflect), gd_lumen (light, air drain, stun flash), gd_momo (projectile eating)
- **Consumes:** Guardian base + gAttack (CMP-SYS)
- **Tests:**
  ```
  node tools/test_guardians.mjs --only B
  ```

#### CMP-MOUNT — MountRider runtime + the 6 Part 1 mounts (L)

- **Spec:** companions §3 (all), §11.4 riderView; world2 §14 interplay; MASTER_PLAN §1.2 P2 mount table, §1.14
- **Owns:** `src/game/mount.js`, `tools/test_mount.mjs` (new)
- **Depends on:** CMP-DATA, GAME-HOOKS, WORLD-CAM
- **Provides:** MountRider (states, fit/unstuck, profile, gallop ramp, turn, jump/glide/fly/swim/wall-kick, charge, 6 Part 1 specials, landing impact, damage model, hazards, knock-off/recall/MountGhost, ult/awaken dismount + auto-remount, riderView, adaptMove, riderLift, hurtbox, heal); deep-water auto-dismount; def.windMul/blightMul; DISMOUNT_SKILLS (grep of skills.js); registry read of MOUNT_B (mount_b.js) for the Part 2 mounts
- **Consumes:** mountPose (CMP-MOUNT-ART-A); p.ride in drawHero (ART-HERO-A)
- **Notes:** Until ART-HERO-A lands the rider may float standing on the saddle (development only).
- **Tests:**
  ```
  node tools/test_mount.mjs
  node tools/integration.mjs --only s01,s08
  ```

#### CMP-MOUNT-B — Part 2 mounts: 이그니스, 게일, 실바 (charges, specials, passives) (M)

- **Spec:** MASTER_PLAN §1.2 Part 2 mount table; companions §3.4–3.9 (mechanics reused); world2 §14 interplay
- **Owns:** `src/game/mount_b.js`
- **Depends on:** CMP-MOUNT
- **Provides:** MOUNT_B.mt_ignis (fire charge + ember trail, 업화 발굽, lava ×0.5), mt_gale (8-way charge, glide 2 flaps, 뇌명 급강하, windMul 0.5), mt_silva (horn charge, 정화의 울음 + blight cleanse, blightMul 0.5, poison immune)
- **Consumes:** MountRider hooks (CMP-MOUNT); gimmickOf(blight/wind) (GIMMICK-*)
- **Notes:** Split from v1.0 CMP-MOUNT (9 mounts with 9 specials, flight/glide/swim/wall-kick in one L package).
- **Tests:**
  ```
  node tools/test_mount.mjs --only mt_ignis,mt_gale,mt_silva
  ```

#### CMP-MOUNT-ART-A — Mount rig and renderers: horse/boar templates — 그림메인, 바르그, 코슈타, 이그니스, 실바 (XL)

- **Spec:** companions §11.1–11.2; MASTER_PLAN §1.2, §1.15
- **Owns:** `src/render/mount_rig.js`, `src/render/mounts.js`, `tools/gallery_mounts.html` (new), `assets/painted/companions/mt_warhorse/**`, `src/render/painted/companions/mt_warhorse.js` (new), `tools/painted/companions/mt_warhorse/**`, `assets/painted/companions/mt_boar/**`, `src/render/painted/companions/mt_boar.js` (new), `tools/painted/companions/mt_boar/**`, `assets/painted/companions/mt_skelsteed/**`, `src/render/painted/companions/mt_skelsteed.js` (new), `tools/painted/companions/mt_skelsteed/**`, `assets/painted/companions/mt_ignis/**`, `src/render/painted/companions/mt_ignis.js` (new), `tools/painted/companions/mt_ignis/**`, `assets/painted/companions/mt_silva/**`, `src/render/painted/companions/mt_silva.js` (new), `tools/painted/companions/mt_silva/**`, `src/render/painted/reg/cmp-mount-art-a.js`, `tools/painted/prompts/cmp-mount-art-a.mjs` (new), `tools/kling/manifest_cmp-mount-art-a.json` (new)
- **Depends on:** ART-KIT, CMP-DATA
- **Provides:** mountPose, seatOf, templates horse/boar/stag; drawMount dispatcher (+ MOUNT_DRAW_B registry), drawMountIcon; all states incl. awakened variants and quality levels
- **Consumes:** MOUNT_DRAW_B (CMP-MOUNT-ART-B)
- **Notes:** Painted mode: one painted puppet per companion (back/front layers for mounts), registered in its own reg file (R15); the procedural renderer stays as the fallback. L in vector_hd mode.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_mounts.html" --out /tmp/claude-0/proto/CMP-MOUNT-ART-A --steps "wait:2,shot"
  node tools/.proto_CMP-MOUNT-ART-A/perf.mjs   # ≤ 0.35 ms per draw
  ```

#### CMP-MOUNT-ART-B — Mount renderers: wolf, wyvern, bat, griffin — 스콜, 스칼렛, 녹티스, 게일 (XL)

- **Spec:** companions §11.1–11.2; MASTER_PLAN §1.2
- **Owns:** `src/render/mounts_b.js`, `assets/painted/companions/mt_direwolf/**`, `src/render/painted/companions/mt_direwolf.js` (new), `tools/painted/companions/mt_direwolf/**`, `assets/painted/companions/mt_wyvern/**`, `src/render/painted/companions/mt_wyvern.js` (new), `tools/painted/companions/mt_wyvern/**`, `assets/painted/companions/mt_giantbat/**`, `src/render/painted/companions/mt_giantbat.js` (new), `tools/painted/companions/mt_giantbat/**`, `assets/painted/companions/mt_gale/**`, `src/render/painted/companions/mt_gale.js` (new), `tools/painted/companions/mt_gale/**`, `src/render/painted/reg/cmp-mount-art-b.js`, `tools/painted/prompts/cmp-mount-art-b.mjs` (new), `tools/kling/manifest_cmp-mount-art-b.json` (new)
- **Depends on:** CMP-MOUNT-ART-A
- **Provides:** MOUNT_DRAW_B + rig templates wolf/wyvern/bat/griffin (registered into mount_rig via its template registry)
- **Consumes:** mount_rig template registry
- **Notes:** Painted mode: one painted puppet per companion (back/front layers for mounts), registered in its own reg file (R15); the procedural renderer stays as the fallback. L in vector_hd mode.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_mounts.html" --out /tmp/claude-0/proto/CMP-MOUNT-ART-B --steps "wait:2,shot"
  ```

#### CMP-GUARD-ART-A — Guardian renderers + FX helpers: 아리아, 하티, 핌, 가웨인, 크론, 미네르바 (L)

- **Spec:** companions §11.3
- **Owns:** `src/render/guardians.js`, `tools/gallery_guardians.html` (new), `assets/painted/companions/gd_fairy/**`, `src/render/painted/companions/gd_fairy.js` (new), `tools/painted/companions/gd_fairy/**`, `assets/painted/companions/gd_spiritwolf/**`, `src/render/painted/companions/gd_spiritwolf.js` (new), `tools/painted/companions/gd_spiritwolf/**`, `assets/painted/companions/gd_imp/**`, `src/render/painted/companions/gd_imp.js` (new), `tools/painted/companions/gd_imp/**`, `assets/painted/companions/gd_knight/**`, `src/render/painted/companions/gd_knight.js` (new), `tools/painted/companions/gd_knight/**`, `assets/painted/companions/gd_whelp/**`, `src/render/painted/companions/gd_whelp.js` (new), `tools/painted/companions/gd_whelp/**`, `assets/painted/companions/gd_owl/**`, `src/render/painted/companions/gd_owl.js` (new), `tools/painted/companions/gd_owl/**`, `src/render/painted/reg/cmp-guard-art-a.js`, `tools/painted/prompts/cmp-guard-art-a.mjs` (new), `tools/kling/manifest_cmp-guard-art-a.json` (new)
- **Depends on:** ART-KIT, CMP-DATA
- **Provides:** drawGuardian dispatcher (+ GUARDIAN_DRAW_B), drawGuardianIcon, FX helpers fxFairyDome … fxSecretOutline
- **Notes:** Painted mode: one painted puppet per companion (back/front layers for mounts), registered in its own reg file (R15); the procedural renderer stays as the fallback. L in vector_hd mode.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_guardians.html" --out /tmp/claude-0/proto/CMP-GUARD-ART-A --steps "wait:2,shot"
  ```

#### CMP-GUARD-ART-B — Guardian renderers: 틱톡, 모르스, 미라, 루멘, 모모 (L)

- **Spec:** companions §11.3; MASTER_PLAN §1.2
- **Owns:** `src/render/guardians_b.js`, `assets/painted/companions/gd_clock/**`, `src/render/painted/companions/gd_clock.js` (new), `tools/painted/companions/gd_clock/**`, `assets/painted/companions/gd_reaper/**`, `src/render/painted/companions/gd_reaper.js` (new), `tools/painted/companions/gd_reaper/**`, `assets/painted/companions/gd_mirra/**`, `src/render/painted/companions/gd_mirra.js` (new), `tools/painted/companions/gd_mirra/**`, `assets/painted/companions/gd_lumen/**`, `src/render/painted/companions/gd_lumen.js` (new), `tools/painted/companions/gd_lumen/**`, `assets/painted/companions/gd_momo/**`, `src/render/painted/companions/gd_momo.js` (new), `tools/painted/companions/gd_momo/**`, `src/render/painted/reg/cmp-guard-art-b.js`, `tools/painted/prompts/cmp-guard-art-b.mjs` (new), `tools/kling/manifest_cmp-guard-art-b.json` (new)
- **Depends on:** CMP-GUARD-ART-A
- **Provides:** GUARDIAN_DRAW_B
- **Notes:** Painted mode: one painted puppet per companion (back/front layers for mounts), registered in its own reg file (R15); the procedural renderer stays as the fallback. L in vector_hd mode.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_guardians.html" --out /tmp/claude-0/proto/CMP-GUARD-ART-B --steps "wait:2,shot"
  ```

#### CMP-UI — Companion HUD widgets and call-outs, 동료 menu tab, join reveal scene (L)

- **Spec:** companions §7.1, §7.2, §7.4, §7.5; MASTER_PLAN §1.8, §1.13
- **Owns:** `src/render/companion_hud.js`, `src/scenes/menu/tab_companions.js`, `src/scenes/companion_join.js`
- **Depends on:** CMP-DATA, HUD-LAYOUT, PLAT-INPUT, FONTS-FU
- **Provides:** drawCompanionHUD → rects; call-out lane; CompanionsTab (uiScale, Scroller.follow, HeroStage preview with p.ride); CompanionJoinScene
- **Consumes:** hudLayout; prompts; HeroStage (PLAT-TURNTABLE); drawMount/drawGuardian
- **Tests:**
  ```
  node tools/test_hud_layout.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s01&cmp=all&mount=mt_warhorse&guards=gd_fairy,gd_knight&ride=1" --out /tmp/claude-0/proto/CMP-UI --steps "wait:3,right:1,shot"
  node tools/smoke.mjs --url "index.html?scene=hub&cmp=all&ch=9" --out /tmp/claude-0/proto/CMP-UI --steps "wait:3,menu:0.1,wait:0.5,shot" --mobile
  ```

#### CMP-TOWN — Stable of Souls: town extension, Greta, facade, stable scene, companion scripts (L)

- **Spec:** companions §2.2, §7.3, §13 (scripts; the two quests go to ITEMS-P2)
- **Owns:** `src/scenes/town/stable.js`, `src/scenes/town/facades.js`, `src/data/town.js`, `src/data/npcs.js`, `src/data/story_companions.js`
- **Depends on:** CMP-DATA, EXT-QAFIX
- **Provides:** town width 96, stable door/Greta NPC; PAINT/LIVE/HEIGHT.stable facade + 'horse' sign icon; StableScene (tribute, shop, eggs, quests); COMPANION_SCRIPTS (cmp_stable_open, npc_greta_*, q_cq_*, cmp_egg_ready, cmp_bat_arrive, cmp_slot2)
- **Consumes:** companion_state API; town/common.js UI kit (read-only)
- **Tests:**
  ```
  node tools/smoke.mjs --url "index.html?scene=hub&cmp=&ch=1" --out /tmp/claude-0/proto/CMP-TOWN --steps "wait:4,enter:0.1,wait:1,enter:0.1,wait:1,shot"
  node tools/validate_maps.mjs
  ```

#### PLAT-MENU — Menu system for touch, pad and scale (scroll fix, swipe, long-press, glyphs) + 동료 tab row (L)

- **Spec:** platform §5.6, §6.2, §6.3, §11 WP-4, P-01/P-17/P-28; companions §7.2 (MENU_TABS row, paw glyph); integration notes (refreshStats after learning a passive)
- **Owns:** `src/scenes/menu/menu.js`, `src/scenes/menu/common.js`, `src/scenes/menu/base.js`, `src/scenes/menu/access.js`, `src/scenes/menu/tab_inventory.js`, `src/scenes/menu/tab_skills.js`, `src/scenes/menu/tab_quests.js`, `src/scenes/menu/tab_docs.js`, `src/scenes/menu/tab_bestiary.js`, `src/scenes/menu/tab_system.js`, `src/scenes/reg_menu.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS, PLAT-QA
- **Provides:** Scroller.follow/shouldFollow; swipe tabs, long-press action menu, right-stick scroll; hintRow via prompts.legacyKey; Layer keys include ui.fontEpoch and clamp to the pixel budget; MENU_TABS companions row + 'paw' glyph; uiScale on the menu scene; menu prevTab/nextTab keep Q and E distinct (§1.4); hidePad shim → scene flag; tab_system/tab_bestiary/access group Part 2 stages (§1.14)
- **Consumes:** prompts, game.uiK, ui.taps
- **Notes:** Keep the accounts' changes in tab_system.js.
- **Tests:**
  ```
  node tools/qa/platform_menu.mjs
  node tools/integration.mjs --only menu
  ```

#### PLAT-TURNTABLE — Hero turntable in status/equip/class tabs (interaction + interim fallback) (L)

- **Spec:** platform §7.1–7.3 (interim fallback), §11 WP-5, P-11; companions §7.2 (HeroStage reuse)
- **Owns:** `src/scenes/menu/hero_view.js`, `src/scenes/menu/tab_status.js`, `src/scenes/menu/tab_equip.js`, `src/scenes/menu/tab_class.js`, `tools/gallery_turntable.html` (new), `tools/qa/turntable.mjs` (new)
- **Depends on:** PLAT-INPUT, PLAT-CORE, PLAT-QA
- **Provides:** HeroView yaw/yawVel/yawGoal/autoSpin; drag, inertia, snap, wheel, keys, right stick, touch buttons, equip reveal, showcase tween; HeroStage API unchanged for CMP-UI; offscreen passes clamped to the pixel budget
- **Consumes:** HERO_VIEW + opts.yaw (ART-HERO-B, W3; fallback until then)
- **Notes:** HERO_VIEW is a W3 export of hero.js: read it through a namespace import (import * as HERO from '../../render/hero.js'; HERO.HERO_VIEW), never a named import (R6).
- **Tests:**
  ```
  node tools/qa/turntable.mjs
  node tools/smoke.mjs --url "tools/gallery_turntable.html" --out /tmp/claude-0/proto/PLAT-TURNTABLE --steps "wait:3,shot"
  ```

#### PLAT-FRONT-A — Front scenes for touch/pad/scale + title features (title, common, slots, difficulty, charselect, highscore, dialogs) (L)

- **Spec:** platform §11 WP-6 (front files except options/story/ending/arcade/account), P-21/P-23, §9.4.6 APK link; fonts follow-ups (title logo, highscore); integration notes (slots drawSlot guard); MASTER_PLAN §1.16
- **Owns:** `src/scenes/title.js`, `src/scenes/front/common.js`, `src/scenes/front/slots.js`, `src/scenes/front/difficulty.js`, `src/scenes/front/charselect.js`, `src/scenes/front/highscore.js`, `src/scenes/front/dialogs.js`, `src/scenes/reg_front.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, PLAT-BOOT, FONTS-FU, PLAT-QA, EXT-ACCOUNTS, EXT-QAFIX
- **Provides:** uiScale opt-in, glyph footers, 44 px targets for these scenes; title: bloodText logo, update prompt, audio hint, add-to-home card, APK link; keeps the accounts entry; front/common: footer via prompts.legacyKey, setPad → scene flags, no --touch-op; slots: drawSlot hasOwn guard, cloud badges, chapter up to 20 with a Part 2 marker
- **Consumes:** prompts, game.uiK, platform.onUpdateReady
- **Notes:** Split from v1.0 PLAT-FRONT (12 files, XL).
- **Tests:**
  ```
  node tools/integration.mjs --only title
  node tools/qa/platform_view.mjs --only front
  ```

#### PLAT-FRONT-B — Arcade front scenes: Part 2 courses/presets and survival fixes (arcade.js, arcade_run.js) (M)

- **Spec:** world2 §11; integration notes (arcade presets baseIdFor, survival pit room); fonts follow-ups (arcade_run result/rank); MASTER_PLAN §1.14 (STAGE_ORDER consumers)
- **Owns:** `src/scenes/front/arcade.js`, `src/scenes/front/arcade_run.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, P2-DATA, EXT-QAFIX
- **Provides:** BOSS_ORDER + 7, COURSES 이계편 / 전 보스 연속, LEVEL_PRESETS 이계의 순례자, wtier ≤ 7, p2Known, hidden-option fallback; presets use baseIdFor; survival: pit room in hard mode, STAGE_ORDER_P1 unless p2Known, never def.noArena enemies; bloodText result/rank; uiScale, glyphs
- **Consumes:** front/common footer (PLAT-FRONT-A; legacy calls keep working); def.noArena (P2-DATA)
- **Notes:** Part 2 bosses in boss rush work only after BOSS-P2-* land; until then the Part 2 courses stay hidden unless their classes resolve.
- **Tests:**
  ```
  node tools/integration.mjs --only arcade
  node tools/smoke.mjs --url "index.html?scene=survival" --out /tmp/claude-0/proto/PLAT-FRONT-B --steps "wait:3,right:1,attack:0.2,shot"
  ```

#### PLAT-ACCOUNT-UI — Account and cloud-save screens adopt the platform UI rules (S)

- **Spec:** platform §6.2/§6.3/§4.5, P-29; docs/ACCOUNTS.md
- **Owns:** `src/scenes/front/account.js`, `src/scenes/front/cloud_ui.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS
- **Provides:** uiScale, glyph hints, 44 px targets; P-29 pad message for code entry; offline/logout/expired-session states readable on phones
- **Consumes:** cloud.js API (EXT-ACCOUNTS, read-only)
- **Notes:** Starts only after EXT-ACCOUNTS is done; functional account changes stay with the accounts owner (R7 requests).
- **Tests:**
  ```
  node tools/qa/platform_view.mjs --only account
  npm run test:api
  ```

#### PLAT-OPTIONS — Options pages, pad/keyboard remap screens, generated controls guide (L)

- **Spec:** platform §10 (pages), §4.7 (remap UI), P-29; feel §7 rows; companions §6 (guide rows); MASTER_PLAN §1.4, §1.5
- **Owns:** `src/scenes/front/options.js`, `src/scenes/front/options_controls.js` (new)
- **Depends on:** PLAT-INPUT, PLAT-CORE, PLAT-SAVE-ASSETS, PLAT-TOUCH, PLAT-QA
- **Provides:** 5 pages (소리/화면/조작/터치/기타) with every §1.5 row; remap capture with conflict swap (12 remappable actions); guides generated from input.bindings (incl. mount/guard/awaken); touch layout editor entry
- **Consumes:** input.bindings, touchpad.openEditor
- **Tests:**
  ```
  node tools/qa/platform_view.mjs
  node tools/smoke.mjs --url "index.html?scene=options" --out /tmp/claude-0/proto/PLAT-OPTIONS --steps "wait:2,down:0.1,right:0.1,shot"
  ```

#### PLAT-TOWN — Town scenes for touch/pad/scale + hub hooks (quick inventory, companions, optional sky crack) (L)

- **Spec:** platform §11 WP-7 (town part); companions §12.3 hub.js hooks; world2 §10 hub sky crack (optional)
- **Owns:** `src/scenes/town/hub.js`, `src/scenes/town/common.js`, `src/scenes/town/shop.js`, `src/scenes/town/smith.js`, `src/scenes/town/church.js`, `src/scenes/town/party.js`, `src/scenes/town/questboard.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, CMP-DATA, EXT-QAFIX, PLAT-QA
- **Provides:** glyph hints, uiScale, list rows ≥ 36 CSS px; hub: map → menu inventory; NO_COMBAT += 'guard'; companionHubEnter on enter/onResume; boardInfo.stableNote; door 'scene:stable'; optional Part 2 sky crack; hub sets padHideButtons = NO_COMBAT (+ guard) instead of the DOM townPad; church.js groups Part 2 stages (§1.14)
- **Consumes:** companionHubEnter/companionHubNote (CMP-SYS; stub)
- **Tests:**
  ```
  node tools/integration.mjs --only hub
  node tools/qa/platform_view.mjs
  ```

#### PLAT-GAMES — Minigames for touch/pad/scale (+ JACKPOT bloodText) (L)

- **Spec:** platform §11 WP-7 (games, pause, dialogue, results); world2 §2.3 (results toEnding s20), §2.4 (recruit in dialogue.js); fonts follow-ups (results, slot JACKPOT); integration notes (pause return to the gate, dialogue portrait fade, results routing)
- **Owns:** `src/scenes/games/**`, `src/scenes/reg_games.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-QAFIX, PLAT-QA
- **Provides:** uiScale + glyphs + sizes in every minigame; B/Esc opens the 그만두기 confirm; padPush/padPop/padHide → scene flags; bloodText JACKPOT
- **Consumes:** prompts, game.uiK
- **Tests:**
  ```
  node tools/integration.mjs --only inn
  node tools/qa/platform_view.mjs --only games
  ```

#### PLAT-DIALOG — Pause, dialogue and results for touch/pad/scale + recruit cmd + s20 ending route (M)

- **Spec:** platform §11 WP-7 (pause, dialogue, results); world2 §2.3 (results toEnding s20), §2.4 (recruit in dialogue.js); fonts follow-ups (results STAGE CLEAR/rank); integration notes (pause return to the gate, dialogue portrait fade and name/portrait override, results routing)
- **Owns:** `src/scenes/pause.js`, `src/scenes/dialogue.js`, `src/scenes/results.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, PLAT-QA, EXT-QAFIX
- **Provides:** dialogue {cmd:'recruit'} (+ skipAll runs it); results toEnding for s12/s13/s20; bloodText STAGE CLEAR/rank; pause '마을로 귀환' starts at the gate; uiScale, glyphs, ≥ 44 CSS px rows
- **Consumes:** game.companions?.recruit (CMP-DATA)
- **Notes:** Split from v1.0 PLAT-GAMES (games + pause + dialogue + results, XL).
- **Tests:**
  ```
  node tools/integration.mjs --only s01,s04_boss
  node tools/qa/platform_view.mjs --only pause,dialogue,results
  ```

#### DELIVERY-WEB — Web delivery tooling: allowlist build, Netlify config, service worker, asset variants (L)

- **Spec:** platform §9.1–9.3, §6.7 variants, P-08, P-10; docs/ACCOUNTS.md (functions); MASTER_PLAN §1.20
- **Owns:** `netlify.toml`, `sw.js`, `robots.txt` (new), `tools/deploy/**`, `tools/assets/make_variants.py` (new), `assets/lo/**`
- **Depends on:** PLAT-CORE, EXT-ACCOUNTS, PLAT-QA, PLAT-BOOT, PLAT-SAVE-ASSETS
- **Provides:** build_web.mjs (allowlist, deny check, build.json, modulepreload, build-info.js, stamped URLs, SW precache injection, sizes); serve_dist.mjs (brotli + headers); smoke_deployed.mjs; sw.js per §1.20; netlify.toml per §1.20; make_variants.py → assets/lo/; tools/deploy/build_artifact.mjs: dist/artifact/ with a generated page, ≤ 8 module chunks (zero-dependency bundler), ≤ 40 asset packs, fonts; --check enforces ≤ 511 files / 256 MB per version and ≤ 255 files / 64 MB per batch; size report against the revised budgets (dist/web ≤ 90 MB, APK input ≤ 45 MB)
- **Consumes:** assets.usePack (PLAT-SAVE-ASSETS)
- **Notes:** Never deploy from here; DELIVER-WEB (W6) deploys.
- **Tests:**
  ```
  node tools/deploy/build_web.mjs
  node tools/deploy/build_web.mjs --selftest-deny   # a dummy keystore in an allowlisted dir must fail the build
  node tools/qa/platform_load.mjs --dist
  node tools/deploy/build_artifact.mjs --check
  ```

#### MAPS-P2-A — Maps s14–s15 and the stages.js ownership for Part 2 (L)

- **Spec:** world2 §4.2 (s14, s15 entries, header comment), §4.3 (s14, s15)
- **Owns:** `src/data/maps/s14.js` (new), `src/data/maps/s15.js` (new), `src/data/stages.js`
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S14–S15 rooms per §4.3; stages s14, s15 inserted after their anchors
- **Consumes:** validator rules, enemy/item/doc ids
- **Notes:** Owns stages.js this wave; MAPS-P2-B/C/D only append after their anchors.
- **Tests:**
  ```
  node tools/validate_maps.mjs s14 && node tools/validate_maps.mjs s15
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s14&room=r1" --out /tmp/claude-0/proto/MAPS-P2-A --steps "wait:3,right:2,up:0.1,wait:0.3,right:2,shot"
  ```

#### MAPS-P2-B — Maps s16–s17 (L)

- **Spec:** world2 §4.2 (s16, s17 entries), §4.3 (s16, s17)
- **Owns:** `src/data/maps/s16.js` (new), `src/data/maps/s17.js` (new)
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 map imports s16–s17 (MAPS-P2-B) ──`: import { ROOMS as S16 } from './maps/s16.js'; import { ROOMS as S17 } from './maps/s17.js';
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 stages s16–s17 (MAPS-P2-B) ──`: s16: S({…}), s17: S({…}) exactly as world2 §4.2
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S16–S17 rooms; stages s16, s17
- **Tests:**
  ```
  node tools/validate_maps.mjs s16 && node tools/validate_maps.mjs s17
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s17&room=r1" --out /tmp/claude-0/proto/MAPS-P2-B --steps "wait:3,right:1.5,shot"
  ```

#### MAPS-P2-C — Maps s18–s19 (L)

- **Spec:** world2 §4.2 (s18, s19 entries), §4.3 (s18, s19)
- **Owns:** `src/data/maps/s18.js` (new), `src/data/maps/s19.js` (new)
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 map imports s18–s19 (MAPS-P2-C) ──`: import { ROOMS as S18 } from './maps/s18.js'; import { ROOMS as S19 } from './maps/s19.js';
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 stages s18–s19 (MAPS-P2-C) ──`: s18: S({…}), s19: S({…}) exactly as world2 §4.2
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S18–S19 rooms; stages s18, s19
- **Tests:**
  ```
  node tools/validate_maps.mjs s18 && node tools/validate_maps.mjs s19
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s18&room=r2" --out /tmp/claude-0/proto/MAPS-P2-C --steps "wait:3,right:1.5,shot"
  ```

#### MAPS-P2-D — Map s20 (void wall, remix rooms, l33/l34 placement) (M)

- **Spec:** world2 §4.2 (s20 entry), §4.3 (s20; l33/l34 placement §8)
- **Owns:** `src/data/maps/s20.js` (new)
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 map imports s20 (MAPS-P2-D) ──`: import { ROOMS as S20 } from './maps/s20.js';
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 stages s20 (MAPS-P2-D) ──`: s20: S({…}) exactly as world2 §4.2
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S20 rooms; stage s20
- **Consumes:** validator rules, enemy/item/doc ids
- **Notes:** v1.0 split the 7 stages 3/2/2 (18/14/14 rooms, s20 alone has 8 rooms and the chase void wall); v1.1 uses 2/2/2/1.
- **Tests:**
  ```
  node tools/validate_maps.mjs s20
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s20&room=r1" --out /tmp/claude-0/proto/MAPS-P2-D --steps "wait:5,right:3,shot"
  ```

#### ENEMY-P2-C-AI — Part 2 enemy AI kinds for s14–s16 (+ data tuning) (L)

- **Spec:** world2 §5.1, §5.3 (chandelier, forgeimp, slag, chainhook, bellows, swimmer, tidecaller, siren) + reused kinds
- **Owns:** `src/game/ai_c.js`, `src/data/enemies_c.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, FEEL-REACT
- **Provides:** AI_C kinds with telegraphs, anim names per §5.3
- **Consumes:** gimmickOf (deep for swimmer); Zone/PROJ_B helpers (read-only from ai_b.js)
- **Tests:**
  ```
  node tools/.proto_ENEMY-P2-C-AI/spawn.mjs   # spawns each enemy in a test room, 8 s, zero errors
  node tools/integration.mjs --only s01
  ```

#### ENEMY-P2-C-ART — Part 2 enemy renderers s14–s16 (12) (XL)

- **Spec:** world2 §5.1 render rules, §5.4; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_c.js`, `tools/gallery_enemies_c.html` (new), `assets/painted/enemies/mirror_knight/**`, `src/render/painted/enemies/mirror_knight.js` (new), `tools/painted/enemies/mirror_knight/**`, `assets/painted/enemies/glass_wraith/**`, `src/render/painted/enemies/glass_wraith.js` (new), `tools/painted/enemies/glass_wraith/**`, `assets/painted/enemies/reflection/**`, `src/render/painted/enemies/reflection.js` (new), `tools/painted/enemies/reflection/**`, `assets/painted/enemies/chandelier_fiend/**`, `src/render/painted/enemies/chandelier_fiend.js` (new), `tools/painted/enemies/chandelier_fiend/**`, `assets/painted/enemies/forge_imp/**`, `src/render/painted/enemies/forge_imp.js` (new), `tools/painted/enemies/forge_imp/**`, `assets/painted/enemies/slag_golem/**`, `src/render/painted/enemies/slag_golem.js` (new), `tools/painted/enemies/slag_golem/**`, `assets/painted/enemies/chain_warden/**`, `src/render/painted/enemies/chain_warden.js` (new), `tools/painted/enemies/chain_warden/**`, `assets/painted/enemies/bellows/**`, `src/render/painted/enemies/bellows.js` (new), `tools/painted/enemies/bellows/**`, `assets/painted/enemies/abyss_angler/**`, `src/render/painted/enemies/abyss_angler.js` (new), `tools/painted/enemies/abyss_angler/**`, `assets/painted/enemies/sunken_priest/**`, `src/render/painted/enemies/sunken_priest.js` (new), `tools/painted/enemies/sunken_priest/**`, `assets/painted/enemies/coral_crab/**`, `src/render/painted/enemies/coral_crab.js` (new), `tools/painted/enemies/coral_crab/**`, `assets/painted/enemies/siren/**`, `src/render/painted/enemies/siren.js` (new), `tools/painted/enemies/siren/**`, `src/render/painted/reg/enemy-p2-c-art.js`, `tools/painted/prompts/enemy-p2-c-art.mjs` (new), `tools/kling/manifest_enemy-p2-c-art.json` (new)
- **Depends on:** ART-KIT, P2-DATA
- **Provides:** RENDER_C (+ PROJ_C/ZONE_C) for 12 enemies, every anim
- **Consumes:** art kit
- **Notes:** Painted mode: 12 painted puppets plus a simple vector fallback (≤ 60 lines each) in the vector file; L in vector_hd mode. Checkpoint per enemy (R15).
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_c.html" --out /tmp/claude-0/proto/ENEMY-P2-C-ART --steps "wait:3,shot"
  ```

#### ENEMY-P2-D-AI — Part 2 enemy AI kinds for s17–s20 (+ data tuning) (L)

- **Spec:** world2 §5.1, §5.3 (galeknight, roc, jelly, puppeteer, stalker, treant, moth, husk, herald) + reused kinds
- **Owns:** `src/game/ai_d.js`, `src/data/enemies_d.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT
- **Provides:** AI_D kinds
- **Consumes:** gimmickOf (wind, blight)
- **Tests:**
  ```
  node tools/.proto_ENEMY-P2-D-AI/spawn.mjs
  ```

#### ENEMY-P2-D-ART — Part 2 enemy renderers s17–s20 (12) (XL)

- **Spec:** world2 §5.1 render rules, §5.4; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_d.js`, `tools/gallery_enemies_d.html` (new), `assets/painted/enemies/storm_harpy/**`, `src/render/painted/enemies/storm_harpy.js` (new), `tools/painted/enemies/storm_harpy/**`, `assets/painted/enemies/gale_knight/**`, `src/render/painted/enemies/gale_knight.js` (new), `tools/painted/enemies/gale_knight/**`, `assets/painted/enemies/thunder_roc/**`, `src/render/painted/enemies/thunder_roc.js` (new), `tools/painted/enemies/thunder_roc/**`, `assets/painted/enemies/cloud_jelly/**`, `src/render/painted/enemies/cloud_jelly.js` (new), `tools/painted/enemies/cloud_jelly/**`, `assets/painted/enemies/puppeteer/**`, `src/render/painted/enemies/puppeteer.js` (new), `tools/painted/enemies/puppeteer/**`, `assets/painted/enemies/faceless/**`, `src/render/painted/enemies/faceless.js` (new), `tools/painted/enemies/faceless/**`, `assets/painted/enemies/dream_eater/**`, `src/render/painted/enemies/dream_eater.js` (new), `tools/painted/enemies/dream_eater/**`, `assets/painted/enemies/rot_treant/**`, `src/render/painted/enemies/rot_treant.js` (new), `tools/painted/enemies/rot_treant/**`, `assets/painted/enemies/plague_moth/**`, `src/render/painted/enemies/plague_moth.js` (new), `tools/painted/enemies/plague_moth/**`, `assets/painted/enemies/fungal_husk/**`, `src/render/painted/enemies/fungal_husk.js` (new), `tools/painted/enemies/fungal_husk/**`, `assets/painted/enemies/void_herald/**`, `src/render/painted/enemies/void_herald.js` (new), `tools/painted/enemies/void_herald/**`, `assets/painted/enemies/nihil_spawn/**`, `src/render/painted/enemies/nihil_spawn.js` (new), `tools/painted/enemies/nihil_spawn/**`, `src/render/painted/reg/enemy-p2-d-art.js`, `tools/painted/prompts/enemy-p2-d-art.mjs` (new), `tools/kling/manifest_enemy-p2-d-art.json` (new)
- **Depends on:** ART-KIT, P2-DATA
- **Provides:** RENDER_D, PROJ_D, ZONE_D
- **Consumes:** art kit
- **Notes:** Painted mode: 12 painted puppets plus a simple vector fallback (≤ 60 lines each) in the vector file; L in vector_hd mode. Checkpoint per enemy (R15).
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_d.html" --out /tmp/claude-0/proto/ENEMY-P2-D-ART --steps "wait:3,shot"
  ```

#### BOSS-P2-1 — Bosses 나르키사 and 몰록 (+ boss data C) (L)

- **Spec:** world2 §6.1–6.3, §1.3 phase-script rules; MASTER_PLAN §1.13, §1.14
- **Owns:** `src/game/bosses/c_narkissa.js`, `src/game/bosses/c_moloch.js`, `src/data/bosses_c.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT
- **Provides:** classes extending BossB with the contracted state names; boss data C tuning
- **Consumes:** gimmickOf('magma'); art kit
- **Notes:** b_narkissa_shatter pushed once in story mode. Draws in vector at the Part 2 bar (world2 §0); painted art for these bosses is ART-BOSS-6…8 in W3. No dependency on the art gate.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/BOSS-P2-1 --steps "wait:3,shot"
  node tools/.proto_BOSS-P2-1/patterns.mjs   # debugAct every pattern, debugPhase each phase
  ```

#### BOSS-P2-2 — Bosses 다곤 and 지즈 (L)

- **Spec:** world2 §6.1, §6.4, §6.5
- **Owns:** `src/game/bosses/c_dagon.js`, `src/game/bosses/c_ziz.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT
- **Provides:** Dagon (flood via deep.setWaterRow), Ziz (gust via wind)
- **Consumes:** c_common.js (BOSS-P2-KIT); data changes via R7 requests to BOSS-P2-1 (owner of data/bosses_c.js)
- **Notes:** Needs data changes? Use R7 requests to BOSS-P2-1 (owner of data/bosses_c.js). Draws in vector at the Part 2 bar (world2 §0); painted art for these bosses is ART-BOSS-6…8 in W3. No dependency on the art gate.
- **Tests:**
  ```
  node tools/.proto_BOSS-P2-2/patterns.mjs
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/BOSS-P2-2 --steps "wait:3,shot"
  ```

#### BOSS-P2-3 — Bosses 마라 and 베헤모스 (+ boss data D) (L)

- **Spec:** world2 §6.1, §6.6, §6.7
- **Owns:** `src/game/bosses/d_mara.js`, `src/game/bosses/d_behemoth.js`, `src/data/bosses_d.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT
- **Provides:** Mara (dreamshift, falseDawn never touches cleared), Behemoth (blight clouds/pods)
- **Consumes:** gimmickOf('heartbeat'|'blight')
- **Notes:** Draws in vector at the Part 2 bar (world2 §0); painted art for these bosses is ART-BOSS-6…8 in W3. No dependency on the art gate.
- **Tests:**
  ```
  node tools/.proto_BOSS-P2-3/patterns.mjs
  node tools/smoke.mjs --url "tools/gallery_bosses_d.html" --out /tmp/claude-0/proto/BOSS-P2-3 --steps "wait:3,shot"
  ```

#### BOSS-P2-4 — Final boss 니힐 (L)

- **Spec:** world2 §6.1, §6.8; MASTER_PLAN §1.14 (final: sp 100, aw 100 at tier ≥ 1)
- **Owns:** `src/game/bosses/d_nihil.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, BOSS-P2-KIT
- **Provides:** Nihil 4 phases, echoes, collapse via voidwall, final transition
- **Consumes:** gimmickOf('voidwall')
- **Notes:** Draws in vector at the Part 2 bar (world2 §0); painted art for these bosses is ART-BOSS-6…8 in W3. No dependency on the art gate.
- **Tests:**
  ```
  node tools/.proto_BOSS-P2-4/patterns.mjs
  ```

#### STORY-P2-A — Part 2 story A: prologue, chapters 14–17, endings, credits, story/ending scene changes (L)

- **Spec:** world2 §1.1–1.4 (prologue, ch14–17, ch13 NPC branches), §1.6, §1.7, §2.2 normal path, §2.3, §2.4 (front/story.js); fonts (THE END); platform WP-6 items for story/ending; MASTER_PLAN §1.2 (portrait paths)
- **Owns:** `src/data/story_p2.js`, `src/data/story.js`, `src/scenes/front/story.js`, `src/scenes/front/ending.js`
- **Depends on:** SKEL, FONTS-FU, PLAT-INPUT, PLAT-CORE, EXT-QAFIX
- **Provides:** SCRIPTS_P2 (prologue, s14–s17 scripts, endings), CREDITS_P2; story.js: endingAfter s20, creditsFor p2, 5 ch13 branches; front/story.js recruit cmd; ending.js: ENDINGS p2/p2true, decideEnding, credits slides/stats/notes, p2_prologue after true credits, leave → hub
- **Consumes:** SCRIPTS_P2B (STORY-P2-B); game.companions?.recruit
- **Tests:**
  ```
  node --input-type=module -e "const {SCRIPTS}=await import('./src/data/story.js'); for (const id of ['p2_prologue','s14_intro','s17_outro','ending_p2','ending_p2true']) if(!SCRIPTS[id]) throw id; console.log('ok')"
  node tools/integration.mjs --only title
  ```

#### STORY-P2-B — Part 2 story B: chapters 18–20, NPC chapter lines, quest dialogues (L)

- **Spec:** world2 §1.3 (ch18–20), §1.5, §9.2 (q_*_start/_done)
- **Owns:** `src/data/story_p2b.js`
- **Depends on:** SKEL
- **Provides:** SCRIPTS_P2B
- **Tests:**
  ```
  node --input-type=module -e "const {SCRIPTS}=await import('./src/data/story.js'); for (const id of ['s18_intro','b_nihil_final','s20_outro','npc_rook_ch20','q_ab_dawnflower_done']) if(!SCRIPTS[id]) throw id; console.log('ok')"
  ```

#### ITEMS-P2 — Part 2 techniques, quests (incl. Greta's), shop, loot, icons; item text polish (L)

- **Spec:** world2 §6.9, §7 (descs, shop), §8 techs, §9; companions §13 (cq_hati, cq_skoll); integration notes (quests check() loop bug)
- **Owns:** `src/game/skills_p2.js`, `src/data/items.js`, `src/data/lore.js`, `src/data/quests.js`, `src/data/shop.js`, `src/game/quests.js`, `src/game/loot.js`, `src/render/icons.js`
- **Depends on:** P2-DATA, SKEL
- **Provides:** SKILL_IMPL_P2 (tech_mirror, tech_whirl, tech_purge) + TECH_NAMES_P2; LV/MAIN/side quests + goal 'shards' + reward.flags + shardFound/heartFound subscriptions; chapterTier/smithStock/ROOK_* additions; loot rules §6.9; icon fallbacks (tier 7 colours, wheart, star_shard, rift_lantern, dawnflower)
- **Consumes:** world.gimmickOf?.('blight')
- **Tests:**
  ```
  node --input-type=module -e "const {QUESTS}=await import('./src/data/quests.js'); for (const id of ['bd_rift','ab_dawnflower','cq_hati','cq_skoll']) if(!QUESTS[id]) throw id; console.log('ok')"
  node tools/integration.mjs --only hub,menu
  ```

#### WORLDMAP-P2 — World map page 2, reveals, legacy-save prologue, map UI for touch/pad/scale (L)

- **Spec:** world2 §10, §2.2 legacy path, §12 worldmap2 music; platform WP-7 (worldmap: glyphs, uiScale, P-26 cancel guard); integration notes (label overlap)
- **Owns:** `src/scenes/town/worldmap.js`
- **Depends on:** P2-DATA, PLAT-INPUT, PLAT-CORE, EXT-QAFIX
- **Provides:** pages 0/1, tabs, reveals (s14, s20), page 1 visuals and info panel, hearts/shards display; legacy-save p2_prologue redirect to the hub
- **Consumes:** STAGE_ORDER_P1/P2 (filtered); music 'worldmap2' (EXT-MUSIC-P2)
- **Tests:**
  ```
  node tools/integration.mjs --only worldmap
  node tools/smoke.mjs --url "index.html?scene=worldmap" --out /tmp/claude-0/proto/WORLDMAP-P2 --steps "wait:2,swap:0.1,wait:0.5,shot"
  ```

#### ART-HERO-A — Hero renderer integration: puppet/vector dispatch, detail, gait/feel hooks, rider pose, equipment visuals, NPC dispatch (approach TBD; notes: painted) (L)

- **Spec:** user request #1; feel §3.3.3 (hook); companions §11.4 (rider); world2 §7.2 (rift visual); MASTER_PLAN §1.7 hero order, §1.15
- **Owns:** `src/render/hero.js`, `src/render/hero_parts.js`, `src/render/hero_puppet.js`, `tools/gallery_hero.html`, `tools/puppet/**`, `assets/puppets/**`, `!tools/puppet/src/sera/**`, `!tools/puppet/rigs/sera/**`, `!assets/puppets/sera/**`, `!tools/puppet/src/victor/**`, `!tools/puppet/rigs/victor/**`, `!assets/puppets/victor/**`, `!tools/puppet/src/bran/**`, `!tools/puppet/rigs/bran/**`, `!assets/puppets/bran/**`, `!tools/puppet/src/lia/**`, `!tools/puppet/rigs/lia/**`, `!assets/puppets/lia/**`, `!tools/puppet/src/azel/**`, `!tools/puppet/rigs/azel/**`, `!assets/puppets/azel/**`, `!tools/puppet/src/npcs/**`, `!tools/puppet/rigs/npcs/**`, `!assets/puppets/npcs/**`, `!tools/puppet/manifest_art-*.json`
- **Depends on:** ART-KIT, GATE:ART-DECISION, FEEL-MOVE
- **Provides:** drawHero dispatch per §1.7 step 0 (puppet for heroes with a rig, vector fallback, NPC registry, snapshots/ghosts/menus); gait/feel hooks per §1.7; p.ride seated pose for all 6 heroes; equipment and class looks still visible (weapon type/style/glow/enhance, headgear, cape, armour, wings, aura, tier-7 rift shimmer); drawHero opts contract (tint/alpha/ghost/scale); placeholder `export let HERO_VIEW = undefined` (filled by ART-HERO-B); painted mode keeps equipment visible: procedural weapon by type/style/enhance glow, body armour tint via recolour masks, cape when a cloak is equipped, headgear overlay families (hood/helm/hat/circlet), wings/halo/aura overlays, tier-7 rift shimmer
- **Consumes:** hero_gait.js (FEEL-MOVE); riderView (CMP-MOUNT)
- **Notes:** Takes over the bake-off's hero.js hooks and hero_puppet.js. The per-hero puppet assets are produced by ART-HERO-ASSETS-1…3 (Kael by the bake-off); this package integrates whatever rigs exist and keeps the vector path for the rest. Depends on FEEL-MOVE because the gait hook reads hero_gait.js (the W0 stub would otherwise hide missing poses).
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_hero.html" --out /tmp/claude-0/proto/ART-HERO-A --steps "wait:3,shot"
  node tools/integration.mjs
  node tools/.proto_ART-HERO-A/perf.mjs   # gameplay drawHero ≤ 1.3× today; ≤ 10/6/3 redraws per frame incl. ghosts
  node tools/.proto_ART-HERO-A/rider.mjs  # 6 heroes seated on mt_warhorse and mt_direwolf: idle, combo frames, charge, cast, hurt; pelvis within 2 px of the seat
  node tools/.proto_ART-HERO-A/feelposes.mjs  # walk/run/sprint/skid/pivot/land_heavy visibly differ on every hero (puppet and vector)
  node tools/.proto_ART-HERO-A/equip.mjs   # for every hero, equipping each slot (weapon type, head, body, cloak, accessories with wings/halo/aura) changes the rendered pixels (diff > 2 %) in both paths; class change changes the silhouette
  ```

#### ART-HERO-ASSETS-1 — Hero puppet assets: sera, victor (7 classes each; painted only) (XL)

- **Spec:** integration notes ART DECISION (heroes); docs/art/PUPPET_PIPELINE.md (bake-off); platform §7.3 (8 turntable directions); user requests #1, #6
- **Owns:** `tools/puppet/src/sera/**`, `tools/puppet/rigs/sera/**`, `assets/puppets/sera/**`, `tools/puppet/src/victor/**`, `tools/puppet/rigs/victor/**`, `assets/puppets/victor/**`, `tools/puppet/manifest_art-hero-assets-1.json` (new)
- **Depends on:** ART-KIT, GATE:ART-DECISION
- **Provides:** sera: 7 class puppets (root, 2× tier 1, 4× tier 2) with grip-hand parts, recolour masks, 8 painted turntable directions per class, seated-leg parts; victor: 7 class puppets (root, 2× tier 1, 4× tier 2) with grip-hand parts, recolour masks, 8 painted turntable directions per class, seated-leg parts
- **Consumes:** tools/puppet pipeline (ART-KIT); portraits/<hero>.webp as the identity reference
- **Notes:** Skipped when the gate picks vector_hd. Checkpoint per class (R15). Kling budget from the lead.
- **Tests:**
  ```
  python3 tools/puppet/build_all.py --heroes sera,victor --check
  node tools/smoke.mjs --url "tools/gallery_hero.html?heroes=sera,victor" --out /tmp/claude-0/proto/ART-HERO-ASSETS-1 --steps "wait:3,shot"
  ```

#### ART-HERO-ASSETS-2 — Hero puppet assets: bran, lia (7 classes each; painted only) (XL)

- **Spec:** integration notes ART DECISION (heroes); docs/art/PUPPET_PIPELINE.md (bake-off); platform §7.3 (8 turntable directions); user requests #1, #6
- **Owns:** `tools/puppet/src/bran/**`, `tools/puppet/rigs/bran/**`, `assets/puppets/bran/**`, `tools/puppet/src/lia/**`, `tools/puppet/rigs/lia/**`, `assets/puppets/lia/**`, `tools/puppet/manifest_art-hero-assets-2.json` (new)
- **Depends on:** ART-KIT, GATE:ART-DECISION
- **Provides:** bran: 7 class puppets (root, 2× tier 1, 4× tier 2) with grip-hand parts, recolour masks, 8 painted turntable directions per class, seated-leg parts; lia: 7 class puppets (root, 2× tier 1, 4× tier 2) with grip-hand parts, recolour masks, 8 painted turntable directions per class, seated-leg parts
- **Consumes:** tools/puppet pipeline (ART-KIT); portraits/<hero>.webp as the identity reference
- **Notes:** Skipped when the gate picks vector_hd. Checkpoint per class (R15). Kling budget from the lead.
- **Tests:**
  ```
  python3 tools/puppet/build_all.py --heroes bran,lia --check
  node tools/smoke.mjs --url "tools/gallery_hero.html?heroes=bran,lia" --out /tmp/claude-0/proto/ART-HERO-ASSETS-2 --steps "wait:3,shot"
  ```

#### ART-HERO-ASSETS-3 — Hero puppet assets: azel (7 classes each; painted only) (XL)

- **Spec:** integration notes ART DECISION (heroes); docs/art/PUPPET_PIPELINE.md (bake-off); platform §7.3 (8 turntable directions); user requests #1, #6
- **Owns:** `tools/puppet/src/azel/**`, `tools/puppet/rigs/azel/**`, `assets/puppets/azel/**`, `tools/puppet/manifest_art-hero-assets-3.json` (new)
- **Depends on:** ART-KIT, GATE:ART-DECISION
- **Provides:** azel: 7 class puppets (root, 2× tier 1, 4× tier 2) with grip-hand parts, recolour masks, 8 painted turntable directions per class, seated-leg parts
- **Consumes:** tools/puppet pipeline (ART-KIT); portraits/<hero>.webp as the identity reference
- **Notes:** Skipped when the gate picks vector_hd. Checkpoint per class (R15). Kling budget from the lead.
- **Tests:**
  ```
  python3 tools/puppet/build_all.py --heroes azel --check
  node tools/smoke.mjs --url "tools/gallery_hero.html?heroes=azel" --out /tmp/claude-0/proto/ART-HERO-ASSETS-3 --steps "wait:3,shot"
  ```

#### ART-NPC — NPC puppets (7 NPCs incl. Greta and Rook's Part 2 look) and the NPC registry (L)

- **Spec:** integration notes (NPCs look like stickers next to painted heroes; "NPCs" in next production); companions §2.2 (Greta look); world2 §1.2 (Rook/Raven)
- **Owns:** `src/render/painted/reg/npcs.js`, `tools/puppet/src/npcs/**`, `tools/puppet/rigs/npcs/**`, `assets/puppets/npcs/**`, `tools/puppet/manifest_art-npc.json` (new)
- **Depends on:** ART-KIT, GATE:ART-DECISION
- **Provides:** NPC_PUPPETS for npc_alberto, npc_marta, npc_rook, npc_hadwin, npc_elise, npc_carmilla, npc_greta (idle, walk, talk; town NPC walking in hub.js)
- **Consumes:** drawHero NPC dispatch (ART-HERO-A)
- **Notes:** Painted mode only (vector_hd: NPCs follow the vector detail upgrade of ART-HERO-A). New in v1.1: v1.0 had no NPC art although the kept requirement "시각적 이질감 없음" makes vector NPCs next to painted heroes a visible mismatch.
- **Tests:**
  ```
  node tools/smoke.mjs --url "index.html?scene=hub" --out /tmp/claude-0/proto/ART-NPC --steps "wait:3,right:2,shot"
  node tools/integration.mjs --only hub
  ```

#### ART-BOSS-1 — Boss art: 나이트윙, 밴시 여왕, 둘라한 (drawing only; approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_nightwing.js`, `src/game/bosses/a_banshee.js`, `src/game/bosses/a_dullahan.js`, `assets/painted/bosses/b_nightwing/**`, `src/render/painted/bosses/b_nightwing.js` (new), `tools/painted/configs/b_nightwing.json` (new), `tools/painted/poses/b_nightwing.mjs` (new), `tools/painted/raw/b_nightwing/**`, `assets/painted/bosses/b_banshee/**`, `src/render/painted/bosses/b_banshee.js` (new), `tools/painted/configs/b_banshee.json` (new), `tools/painted/poses/b_banshee.mjs` (new), `tools/painted/raw/b_banshee/**`, `assets/painted/bosses/b_dullahan/**`, `src/render/painted/bosses/b_dullahan.js` (new), `tools/painted/configs/b_dullahan.json` (new), `tools/painted/poses/b_dullahan.mjs` (new), `tools/painted/raw/b_dullahan/**`, `src/render/painted/reg/art-boss-1.js`, `tools/painted/prompts/art-boss-1.mjs` (new), `tools/kling/manifest_art-boss-1.json` (new)
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** grotesque multi-part art, all states/phases, flash, death
- **Consumes:** art kit
- **Notes:** No pattern/timing/hitbox changes. Painted mode: one painted puppet per boss registered in its own reg file (R15), vector drawing kept as the fallback; XL painted / L vector_hd; checkpoint per boss.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_a.html" --out /tmp/claude-0/proto/ART-BOSS-1 --steps "wait:3,shot"
  node tools/integration.mjs --only s01_boss,s02_boss,s03_boss
  ```

#### ART-BOSS-2 — Boss art: 진홍의 갑주군주, 본 드래곤, 그리모어 (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_crimson.js`, `src/game/bosses/a_bonedragon.js`, `src/game/bosses/a_grimoire.js`, `assets/painted/bosses/b_crimson/**`, `src/render/painted/bosses/b_crimson.js` (new), `tools/painted/configs/b_crimson.json` (new), `tools/painted/poses/b_crimson.mjs` (new), `tools/painted/raw/b_crimson/**`, `assets/painted/bosses/b_bonedragon/**`, `src/render/painted/bosses/b_bonedragon.js`, `tools/painted/configs/b_bonedragon.json`, `tools/painted/poses/b_bonedragon.mjs`, `tools/painted/raw/b_bonedragon/**`, `assets/painted/bosses/b_grimoire/**`, `src/render/painted/bosses/b_grimoire.js` (new), `tools/painted/configs/b_grimoire.json` (new), `tools/painted/poses/b_grimoire.mjs` (new), `tools/painted/raw/b_grimoire/**`, `src/render/painted/reg/art-boss-2.js`, `tools/painted/prompts/art-boss-2.mjs` (new), `tools/kling/manifest_art-boss-2.json` (new)
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1 (Bone Dragon starts from the bake-off prototype)
- **Consumes:** art kit
- **Notes:** Painted mode: one painted puppet per boss registered in its own reg file (R15), vector drawing kept as the fallback; XL painted / L vector_hd; checkpoint per boss.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_a.html" --out /tmp/claude-0/proto/ART-BOSS-2 --steps "wait:3,shot"
  node tools/integration.mjs --only s04_boss,s05_boss,s06_boss
  ```

#### ART-BOSS-3 — Boss art: 키메라 호문쿨루스, 레비아탄, 태엽 거신 (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_chimera.js`, `src/game/bosses/b_leviathan.js`, `src/game/bosses/b_colossus.js`, `assets/painted/bosses/b_chimera/**`, `src/render/painted/bosses/b_chimera.js` (new), `tools/painted/configs/b_chimera.json` (new), `tools/painted/poses/b_chimera.mjs` (new), `tools/painted/raw/b_chimera/**`, `assets/painted/bosses/b_leviathan/**`, `src/render/painted/bosses/b_leviathan.js` (new), `tools/painted/configs/b_leviathan.json` (new), `tools/painted/poses/b_leviathan.mjs` (new), `tools/painted/raw/b_leviathan/**`, `assets/painted/bosses/b_colossus/**`, `src/render/painted/bosses/b_colossus.js` (new), `tools/painted/configs/b_colossus.json` (new), `tools/painted/poses/b_colossus.mjs` (new), `tools/painted/raw/b_colossus/**`, `src/render/painted/reg/art-boss-3.js`, `tools/painted/prompts/art-boss-3.mjs` (new), `tools/kling/manifest_art-boss-3.json` (new)
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Notes:** Painted mode: one painted puppet per boss registered in its own reg file (R15), vector drawing kept as the fallback; XL painted / L vector_hd; checkpoint per boss.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-3 --steps "wait:3,shot"
  node tools/integration.mjs --only s07_boss,s08_boss,s09_boss
  ```

#### ART-BOSS-4 — Boss art: 서리 여왕 이자벨라, 사신 데스 (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/b_frostqueen.js`, `src/game/bosses/b_death.js`, `assets/painted/bosses/b_frostqueen/**`, `src/render/painted/bosses/b_frostqueen.js` (new), `tools/painted/configs/b_frostqueen.json` (new), `tools/painted/poses/b_frostqueen.mjs` (new), `tools/painted/raw/b_frostqueen/**`, `assets/painted/bosses/b_death/**`, `src/render/painted/bosses/b_death.js` (new), `tools/painted/configs/b_death.json` (new), `tools/painted/poses/b_death.mjs` (new), `tools/painted/raw/b_death/**`, `src/render/painted/reg/art-boss-4.js`, `tools/painted/prompts/art-boss-4.mjs` (new), `tools/kling/manifest_art-boss-4.json` (new)
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Notes:** Painted mode: one painted puppet per boss registered in its own reg file (R15), vector drawing kept as the fallback; XL painted / L vector_hd; checkpoint per boss.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-4 --steps "wait:3,shot"
  node tools/integration.mjs --only s10_boss,s11_boss
  ```

#### ART-BOSS-5 — Boss art: 드라큘라 백작 (both forms), 혼돈의 군주 (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/b_dracula.js`, `src/game/bosses/b_chaos.js`, `assets/painted/bosses/b_dracula/**`, `src/render/painted/bosses/b_dracula.js` (new), `tools/painted/configs/b_dracula.json` (new), `tools/painted/poses/b_dracula.mjs` (new), `tools/painted/raw/b_dracula/**`, `assets/painted/bosses/b_chaos/**`, `src/render/painted/bosses/b_chaos.js` (new), `tools/painted/configs/b_chaos.json` (new), `tools/painted/poses/b_chaos.mjs` (new), `tools/painted/raw/b_chaos/**`, `src/render/painted/reg/art-boss-5.js`, `tools/painted/prompts/art-boss-5.mjs` (new), `tools/kling/manifest_art-boss-5.json` (new)
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Notes:** The Dracula phase-2 script issue (integration notes) is behavior: log it via R7 for W4 FIX-AI-BOSS. Painted mode: one painted puppet per boss registered in its own reg file (R15), vector drawing kept as the fallback; XL painted / L vector_hd; checkpoint per boss.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-5 --steps "wait:3,shot"
  node tools/integration.mjs --only s12_boss,s13_boss
  ```

#### ART-ENEMY-1 — Enemy art: common + s01–s03 (19) (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a.js`, `assets/painted/enemies/mimic/**`, `src/render/painted/enemies/mimic.js` (new), `tools/painted/enemies/mimic/**`, `assets/painted/enemies/golden_bat/**`, `src/render/painted/enemies/golden_bat.js` (new), `tools/painted/enemies/golden_bat/**`, `assets/painted/enemies/bat/**`, `src/render/painted/enemies/bat.js`, `tools/painted/enemies/bat/**`, `assets/painted/enemies/zombie/**`, `src/render/painted/enemies/zombie.js` (new), `tools/painted/enemies/zombie/**`, `assets/painted/enemies/skeleton/**`, `src/render/painted/enemies/skeleton.js`, `tools/painted/enemies/skeleton/**`, `assets/painted/enemies/crow/**`, `src/render/painted/enemies/crow.js` (new), `tools/painted/enemies/crow/**`, `assets/painted/enemies/wolf/**`, `src/render/painted/enemies/wolf.js` (new), `tools/painted/enemies/wolf/**`, `assets/painted/enemies/possessed/**`, `src/render/painted/enemies/possessed.js` (new), `tools/painted/enemies/possessed/**`, `assets/painted/enemies/ghost/**`, `src/render/painted/enemies/ghost.js`, `tools/painted/enemies/ghost/**`, `assets/painted/enemies/wisp/**`, `src/render/painted/enemies/wisp.js` (new), `tools/painted/enemies/wisp/**`, `assets/painted/enemies/bone_thrower/**`, `src/render/painted/enemies/bone_thrower.js` (new), `tools/painted/enemies/bone_thrower/**`, `assets/painted/enemies/gravedigger/**`, `src/render/painted/enemies/gravedigger.js`, `tools/painted/enemies/gravedigger/**`, `assets/painted/enemies/mud_man/**`, `src/render/painted/enemies/mud_man.js` (new), `tools/painted/enemies/mud_man/**`, `assets/painted/enemies/armor_knight/**`, `src/render/painted/enemies/armor_knight.js`, `tools/painted/enemies/armor_knight/**`, `assets/painted/enemies/axe_armor/**`, `src/render/painted/enemies/axe_armor.js` (new), `tools/painted/enemies/axe_armor/**`, `assets/painted/enemies/gargoyle/**`, `src/render/painted/enemies/gargoyle.js` (new), `tools/painted/enemies/gargoyle/**`, `assets/painted/enemies/medusa_head/**`, `src/render/painted/enemies/medusa_head.js` (new), `tools/painted/enemies/medusa_head/**`, `assets/painted/enemies/medusa_spawner/**`, `src/render/painted/enemies/medusa_spawner.js` (new), `tools/painted/enemies/medusa_spawner/**`, `assets/painted/enemies/skeleton_archer/**`, `src/render/painted/enemies/skeleton_archer.js` (new), `tools/painted/enemies/skeleton_archer/**`, `src/render/painted/reg/art-enemy-1.js`, `tools/painted/prompts/art-enemy-1.mjs` (new), `tools/kling/manifest_art-enemy-1.json` (new)
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 19 renderers at the new bar, every anim
- **Consumes:** art kit, enemies_shared.js (read-only)
- **Notes:** Painted mode: painted puppets registered in the package's reg file (R15); the vector file is not edited (fallback). vector_hd mode: drawing-only rewrite of the vector file. XL painted / L vector_hd; checkpoint per enemy. bat, ghost, skeleton, armor_knight and gravedigger already exist from the bake-off: verify and polish only.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_a.html" --out /tmp/claude-0/proto/ART-ENEMY-1 --steps "wait:3,shot"
  node tools/integration.mjs --only s01,s02,s03
  ```

#### ART-ENEMY-2 — Enemy art: s04–s06 (15) (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a2.js`, `assets/painted/enemies/blood_skeleton/**`, `src/render/painted/enemies/blood_skeleton.js` (new), `tools/painted/enemies/blood_skeleton/**`, `assets/painted/enemies/phantom_sword/**`, `src/render/painted/enemies/phantom_sword.js` (new), `tools/painted/enemies/phantom_sword/**`, `assets/painted/enemies/lesser_demon/**`, `src/render/painted/enemies/lesser_demon.js` (new), `tools/painted/enemies/lesser_demon/**`, `assets/painted/enemies/spear_guard/**`, `src/render/painted/enemies/spear_guard.js` (new), `tools/painted/enemies/spear_guard/**`, `assets/painted/enemies/puppet_maiden/**`, `src/render/painted/enemies/puppet_maiden.js` (new), `tools/painted/enemies/puppet_maiden/**`, `assets/painted/enemies/bone_pillar/**`, `src/render/painted/enemies/bone_pillar.js` (new), `tools/painted/enemies/bone_pillar/**`, `assets/painted/enemies/mummy/**`, `src/render/painted/enemies/mummy.js` (new), `tools/painted/enemies/mummy/**`, `assets/painted/enemies/skeleton_knight/**`, `src/render/painted/enemies/skeleton_knight.js` (new), `tools/painted/enemies/skeleton_knight/**`, `assets/painted/enemies/corpse_worm/**`, `src/render/painted/enemies/corpse_worm.js` (new), `tools/painted/enemies/corpse_worm/**`, `assets/painted/enemies/bone_scimitar/**`, `src/render/painted/enemies/bone_scimitar.js` (new), `tools/painted/enemies/bone_scimitar/**`, `assets/painted/enemies/book_fiend/**`, `src/render/painted/enemies/book_fiend.js` (new), `tools/painted/enemies/book_fiend/**`, `assets/painted/enemies/flea_man/**`, `src/render/painted/enemies/flea_man.js` (new), `tools/painted/enemies/flea_man/**`, `assets/painted/enemies/skeleton_mage/**`, `src/render/painted/enemies/skeleton_mage.js` (new), `tools/painted/enemies/skeleton_mage/**`, `assets/painted/enemies/scholar_ghost/**`, `src/render/painted/enemies/scholar_ghost.js` (new), `tools/painted/enemies/scholar_ghost/**`, `assets/painted/enemies/ectoplasm/**`, `src/render/painted/enemies/ectoplasm.js` (new), `tools/painted/enemies/ectoplasm/**`, `src/render/painted/reg/art-enemy-2.js`, `tools/painted/prompts/art-enemy-2.mjs` (new), `tools/kling/manifest_art-enemy-2.json` (new)
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 15 renderers
- **Consumes:** art kit
- **Notes:** Painted mode: painted puppets registered in the package's reg file (R15); the vector file is not edited (fallback). vector_hd mode: drawing-only rewrite of the vector file. XL painted / L vector_hd; checkpoint per enemy.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_a.html" --out /tmp/claude-0/proto/ART-ENEMY-2 --steps "wait:3,shot"
  node tools/integration.mjs --only s04,s05,s06
  ```

#### ART-ENEMY-3 — Enemy art: s07–s09 (14) + PROJ_B/ZONE_B (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_b.js`, `assets/painted/enemies/slime/**`, `src/render/painted/enemies/slime.js` (new), `tools/painted/enemies/slime/**`, `assets/painted/enemies/homunculus/**`, `src/render/painted/enemies/homunculus.js` (new), `tools/painted/enemies/homunculus/**`, `assets/painted/enemies/flesh_golem/**`, `src/render/painted/enemies/flesh_golem.js` (new), `tools/painted/enemies/flesh_golem/**`, `assets/painted/enemies/plague_doctor/**`, `src/render/painted/enemies/plague_doctor.js` (new), `tools/painted/enemies/plague_doctor/**`, `assets/painted/enemies/acid_turret/**`, `src/render/painted/enemies/acid_turret.js` (new), `tools/painted/enemies/acid_turret/**`, `assets/painted/enemies/merman/**`, `src/render/painted/enemies/merman.js` (new), `tools/painted/enemies/merman/**`, `assets/painted/enemies/killer_fish/**`, `src/render/painted/enemies/killer_fish.js` (new), `tools/painted/enemies/killer_fish/**`, `assets/painted/enemies/frog_demon/**`, `src/render/painted/enemies/frog_demon.js` (new), `tools/painted/enemies/frog_demon/**`, `assets/painted/enemies/drowned/**`, `src/render/painted/enemies/drowned.js` (new), `tools/painted/enemies/drowned/**`, `assets/painted/enemies/water_spirit/**`, `src/render/painted/enemies/water_spirit.js` (new), `tools/painted/enemies/water_spirit/**`, `assets/painted/enemies/gear_golem/**`, `src/render/painted/enemies/gear_golem.js` (new), `tools/painted/enemies/gear_golem/**`, `assets/painted/enemies/harpy/**`, `src/render/painted/enemies/harpy.js` (new), `tools/painted/enemies/harpy/**`, `assets/painted/enemies/clockwork_soldier/**`, `src/render/painted/enemies/clockwork_soldier.js` (new), `tools/painted/enemies/clockwork_soldier/**`, `assets/painted/enemies/cog_wheel/**`, `src/render/painted/enemies/cog_wheel.js` (new), `tools/painted/enemies/cog_wheel/**`, `src/render/painted/reg/art-enemy-3.js`, `tools/painted/prompts/art-enemy-3.mjs` (new), `tools/kling/manifest_art-enemy-3.json` (new)
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 14 renderers + projectile/zone renderers
- **Consumes:** art kit
- **Notes:** Painted mode: painted puppets registered in the package's reg file (R15); the vector file is not edited (fallback). vector_hd mode: drawing-only rewrite of the vector file. XL painted / L vector_hd; checkpoint per enemy.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_b.html" --out /tmp/claude-0/proto/ART-ENEMY-3 --steps "wait:3,shot"
  node tools/integration.mjs --only s07,s08,s09
  ```

#### ART-ENEMY-4 — Enemy art: s10–s11 (10) (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_b2.js`, `assets/painted/enemies/ice_golem/**`, `src/render/painted/enemies/ice_golem.js` (new), `tools/painted/enemies/ice_golem/**`, `assets/painted/enemies/frost_wraith/**`, `src/render/painted/enemies/frost_wraith.js` (new), `tools/painted/enemies/frost_wraith/**`, `assets/painted/enemies/snow_wolf/**`, `src/render/painted/enemies/snow_wolf.js` (new), `tools/painted/enemies/snow_wolf/**`, `assets/painted/enemies/frozen_knight/**`, `src/render/painted/enemies/frozen_knight.js` (new), `tools/painted/enemies/frozen_knight/**`, `assets/painted/enemies/ice_bat/**`, `src/render/painted/enemies/ice_bat.js` (new), `tools/painted/enemies/ice_bat/**`, `assets/painted/enemies/succubus/**`, `src/render/painted/enemies/succubus.js` (new), `tools/painted/enemies/succubus/**`, `assets/painted/enemies/blood_priest/**`, `src/render/painted/enemies/blood_priest.js` (new), `tools/painted/enemies/blood_priest/**`, `assets/painted/enemies/bone_angel/**`, `src/render/painted/enemies/bone_angel.js` (new), `tools/painted/enemies/bone_angel/**`, `assets/painted/enemies/death_knight/**`, `src/render/painted/enemies/death_knight.js` (new), `tools/painted/enemies/death_knight/**`, `assets/painted/enemies/cursed_nun/**`, `src/render/painted/enemies/cursed_nun.js` (new), `tools/painted/enemies/cursed_nun/**`, `src/render/painted/reg/art-enemy-4.js`, `tools/painted/prompts/art-enemy-4.mjs` (new), `tools/kling/manifest_art-enemy-4.json` (new)
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 10 renderers at the new bar, every anim
- **Consumes:** art kit
- **Notes:** Painted mode: painted puppets registered in the package's reg file (R15); the vector file is not edited (fallback). vector_hd mode: drawing-only rewrite of the vector file. XL painted / L vector_hd; checkpoint per enemy.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_b.html" --out /tmp/claude-0/proto/ART-ENEMY-4 --steps "wait:3,shot"
  node tools/integration.mjs --only s10,s11
  ```

#### ART-ENEMY-5 — Enemy art: s12–s13 (9) (approach TBD) (XL)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_b3.js`, `assets/painted/enemies/vampire_bride/**`, `src/render/painted/enemies/vampire_bride.js` (new), `tools/painted/enemies/vampire_bride/**`, `assets/painted/enemies/demon_lord/**`, `src/render/painted/enemies/demon_lord.js` (new), `tools/painted/enemies/demon_lord/**`, `assets/painted/enemies/bat_swarm/**`, `src/render/painted/enemies/bat_swarm.js` (new), `tools/painted/enemies/bat_swarm/**`, `assets/painted/enemies/royal_guard/**`, `src/render/painted/enemies/royal_guard.js` (new), `tools/painted/enemies/royal_guard/**`, `assets/painted/enemies/chaos_spawn/**`, `src/render/painted/enemies/chaos_spawn.js` (new), `tools/painted/enemies/chaos_spawn/**`, `assets/painted/enemies/hellhound/**`, `src/render/painted/enemies/hellhound.js` (new), `tools/painted/enemies/hellhound/**`, `assets/painted/enemies/abyss_eye/**`, `src/render/painted/enemies/abyss_eye.js` (new), `tools/painted/enemies/abyss_eye/**`, `assets/painted/enemies/shadow_hunter/**`, `src/render/painted/enemies/shadow_hunter.js` (new), `tools/painted/enemies/shadow_hunter/**`, `assets/painted/enemies/void_demon/**`, `src/render/painted/enemies/void_demon.js` (new), `tools/painted/enemies/void_demon/**`, `src/render/painted/reg/art-enemy-5.js`, `tools/painted/prompts/art-enemy-5.mjs` (new), `tools/kling/manifest_art-enemy-5.json` (new)
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 9 renderers at the new bar, every anim
- **Consumes:** art kit
- **Notes:** Painted mode: painted puppets registered in the package's reg file (R15); the vector file is not edited (fallback). vector_hd mode: drawing-only rewrite of the vector file. XL painted / L vector_hd; checkpoint per enemy.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_b.html" --out /tmp/claude-0/proto/ART-ENEMY-5 --steps "wait:3,shot"
  node tools/integration.mjs --only s12,s13
  ```

### W3 — Second pass, harnesses, APK follow-ups, docs

| key | title | size | depends on |
|---|---|---|---|
| **ART-HERO-B** | Hero view angles for the turntable (HERO_VIEW, opts.yaw) | L | ART-HERO-A, PLAT-TURNTABLE, ART-HERO-ASSETS-1, ART-HERO-ASSETS-2, ART-HERO-ASSETS-3, ART-NPC |
| **ART-BOSS-6** | Part 2 boss art: 나르키사, 몰록, 다곤 (approach TBD) | XL | ART-KIT, BOSS-P2-1, BOSS-P2-2 |
| **ART-BOSS-7** | Part 2 boss art: 지즈, 마라, 베헤모스 (approach TBD) | XL | ART-KIT, BOSS-P2-2, BOSS-P2-3 |
| **ART-BOSS-8** | Part 2 final boss art: 니힐, all four forms (approach TBD) | L | ART-KIT, BOSS-P2-4 |
| **HUD-FINAL** | HUD second pass with the real widgets | S | FEEL-HUD, CMP-UI, GIMMICK-ENGINE, GIMMICK-KINDS-B, PLAT-CORE, PLAT-TOUCH |
| **HOOK-SWEEP** | Apply queued cross-package requests to frozen engine/UI files | M | FEEL-MOVE, FX-ULTS, OVERLAYS, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, CMP-MOUNT-B, PLAT-CORE, PLAT-BOOT |
| **QA-TOOLS** | Final QA tooling: platform suite update, commands, perf budget, soak, visual review | M | PLAT-QA, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT-A, PLAT-FRONT-B, PLAT-ACCOUNT-UI, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES, PLAT-DIALOG, ART-KIT |
| **FEEL-QA** | Feel acceptance harness | M | FEEL-MOVE, FEEL-HUD, FX-ULTS, FX-ULTKIT, AWAKEN-DIR-A, AWAKEN-DIR-B, OVERLAYS, PLAT-TOUCH, PLAT-QA |
| **CMP-QA** | Companion end-to-end, balance model, room-fit scan | M | CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-ART-B, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-TOWN, CMP-MOUNT-B |
| **P2-QA** | Part 2 acceptance suite, integration cases s14–s20, balance --check | L | MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, EXT-MUSIC-P2, MAPS-P2-D, BOSS-P2-KIT, PLAT-DIALOG, PLAT-FRONT-B |
| **APK-FU** | APK follow-ups: /api proxy, WebView gate, insets and rumble bridges, dist/web packing | L | DELIVERY-WEB, EXT-APK |
| **DOCS-ARCH** | ARCHITECTURE.md update for every new contract | M | FEEL-MOVE, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, ITEMS-P2, STORY-P2-A, PLAT-OPTIONS, WORLDMAP-P2, ART-KIT, PLAT-BOOT |

#### ART-HERO-B — Hero view angles for the turntable (HERO_VIEW, opts.yaw) (L)

- **Spec:** platform §7.3; MASTER_PLAN §1.7 hero order (steps 1 and 7)
- **Owns:** `src/render/hero.js`, `src/render/hero_parts.js`, `src/render/hero_puppet.js`, `tools/gallery_hero.html`, `tools/puppet/**`, `assets/puppets/**`
- **Depends on:** ART-HERO-A, PLAT-TURNTABLE, ART-HERO-ASSETS-1, ART-HERO-ASSETS-2, ART-HERO-ASSETS-3, ART-NPC
- **Provides:** export HERO_VIEW {continuous, steps}; opts.yaw views: front/back/3-4 with correct equipment, cape, wings, hair; cross-over squash between steps
- **Tests:**
  ```
  node tools/qa/turntable.mjs   # acceptance 5: front vs back differ > 8%, symmetric, cape covers back
  node tools/smoke.mjs --url "tools/gallery_turntable.html" --out /tmp/claude-0/proto/ART-HERO-B --steps "wait:3,shot"
  ```

#### ART-BOSS-6 — Part 2 boss art: 나르키사, 몰록, 다곤 (approach TBD) (XL)

- **Spec:** user request #2; world2 §0 art bar, §6.2–6.8 (states, phases); MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/c_narkissa.js`, `src/game/bosses/c_moloch.js`, `src/game/bosses/c_dagon.js`, `assets/painted/bosses/b_narkissa/**`, `src/render/painted/bosses/b_narkissa.js` (new), `tools/painted/configs/b_narkissa.json` (new), `tools/painted/poses/b_narkissa.mjs` (new), `tools/painted/raw/b_narkissa/**`, `assets/painted/bosses/b_moloch/**`, `src/render/painted/bosses/b_moloch.js` (new), `tools/painted/configs/b_moloch.json` (new), `tools/painted/poses/b_moloch.mjs` (new), `tools/painted/raw/b_moloch/**`, `assets/painted/bosses/b_dagon/**`, `src/render/painted/bosses/b_dagon.js` (new), `tools/painted/configs/b_dagon.json` (new), `tools/painted/poses/b_dagon.mjs` (new), `tools/painted/raw/b_dagon/**`, `src/render/painted/reg/art-boss-6.js`, `tools/painted/prompts/art-boss-6.mjs` (new), `tools/kling/manifest_art-boss-6.json` (new)
- **Depends on:** ART-KIT, BOSS-P2-1, BOSS-P2-2
- **Provides:** grotesque multi-part art for every state and phase (painted puppet + VFX, or a vector polish pass)
- **Consumes:** art kit; boss state/phase contract (world2 §6)
- **Notes:** Drawing only (no pattern, timing, hitbox or hit-part changes). New in v1.1: v1.0 had no painted-art package for the 7 Part 2 bosses although the notes say "Part2 bosses/enemies use kits".
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/ART-BOSS-6 --steps "wait:3,shot"
  node tools/integration.mjs --only s14_boss,s15_boss,s16_boss
  ```

#### ART-BOSS-7 — Part 2 boss art: 지즈, 마라, 베헤모스 (approach TBD) (XL)

- **Spec:** user request #2; world2 §0 art bar, §6.2–6.8 (states, phases); MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/c_ziz.js`, `src/game/bosses/d_mara.js`, `src/game/bosses/d_behemoth.js`, `assets/painted/bosses/b_ziz/**`, `src/render/painted/bosses/b_ziz.js` (new), `tools/painted/configs/b_ziz.json` (new), `tools/painted/poses/b_ziz.mjs` (new), `tools/painted/raw/b_ziz/**`, `assets/painted/bosses/b_mara/**`, `src/render/painted/bosses/b_mara.js` (new), `tools/painted/configs/b_mara.json` (new), `tools/painted/poses/b_mara.mjs` (new), `tools/painted/raw/b_mara/**`, `assets/painted/bosses/b_behemoth/**`, `src/render/painted/bosses/b_behemoth.js` (new), `tools/painted/configs/b_behemoth.json` (new), `tools/painted/poses/b_behemoth.mjs` (new), `tools/painted/raw/b_behemoth/**`, `src/render/painted/reg/art-boss-7.js`, `tools/painted/prompts/art-boss-7.mjs` (new), `tools/kling/manifest_art-boss-7.json` (new)
- **Depends on:** ART-KIT, BOSS-P2-2, BOSS-P2-3
- **Provides:** grotesque multi-part art for every state and phase (painted puppet + VFX, or a vector polish pass)
- **Consumes:** art kit; boss state/phase contract (world2 §6)
- **Notes:** Drawing only (no pattern, timing, hitbox or hit-part changes). New in v1.1: v1.0 had no painted-art package for the 7 Part 2 bosses although the notes say "Part2 bosses/enemies use kits".
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_d.html" --out /tmp/claude-0/proto/ART-BOSS-7 --steps "wait:3,shot"
  node tools/integration.mjs --only s17_boss,s18_boss,s19_boss
  ```

#### ART-BOSS-8 — Part 2 final boss art: 니힐, all four forms (approach TBD) (L)

- **Spec:** user request #2; world2 §0 art bar, §6.2–6.8 (states, phases); MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/d_nihil.js`, `assets/painted/bosses/b_nihil/**`, `src/render/painted/bosses/b_nihil.js` (new), `tools/painted/configs/b_nihil.json` (new), `tools/painted/poses/b_nihil.mjs` (new), `tools/painted/raw/b_nihil/**`, `src/render/painted/reg/art-boss-8.js`, `tools/painted/prompts/art-boss-8.mjs` (new), `tools/kling/manifest_art-boss-8.json` (new)
- **Depends on:** ART-KIT, BOSS-P2-4
- **Provides:** grotesque multi-part art for every state and phase (painted puppet + VFX, or a vector polish pass)
- **Consumes:** art kit; boss state/phase contract (world2 §6)
- **Notes:** Drawing only (no pattern, timing, hitbox or hit-part changes). New in v1.1: v1.0 had no painted-art package for the 7 Part 2 bosses although the notes say "Part2 bosses/enemies use kits".
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_d.html" --out /tmp/claude-0/proto/ART-BOSS-8 --steps "wait:3,shot"
  node tools/integration.mjs --only s20_boss
  ```

#### HUD-FINAL — HUD second pass with the real widgets (S)

- **Spec:** MASTER_PLAN §1.8; platform §4.5 HUD glyph adoption
- **Owns:** `src/render/hud.js`, `src/render/hud_layout.js`, `tools/test_hud_layout.mjs`
- **Depends on:** FEEL-HUD, CMP-UI, GIMMICK-ENGINE, GIMMICK-KINDS-B, PLAT-CORE, PLAT-TOUCH
- **Provides:** overlap matrix green with real feel_hud, companion_hud, gimmick meters and toasts; legacy combo block removed once feel_hud draws
- **Tests:**
  ```
  node tools/test_hud_layout.mjs
  node tools/integration.mjs --mobile --only s04_boss
  ```

#### HOOK-SWEEP — Apply queued cross-package requests to frozen engine/UI files (M)

- **Spec:** MASTER_PLAN R7, R14
- **Owns:** `src/game/world.js`, `src/game/player.js`, `src/game/combat.js`, `src/game/enemy.js`, `src/game/stats.js`, `src/game/state.js`, `src/game/skills.js`, `src/game/tilemap.js`, `src/game/props.js`, `src/core/game.js`, `src/core/input.js`, `src/core/ui.js`, `src/core/save.js`, `src/core/camera.js`, `src/core/particles.js`, `src/core/audio.js`, `src/core/touchpad.js`, `src/core/platform.js`, `src/main.js`, `src/scenes/stage.js`, `src/scenes/overlays.js`, `src/scenes/index.js`
- **Depends on:** FEEL-MOVE, FX-ULTS, OVERLAYS, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, CMP-MOUNT-B, PLAT-CORE, PLAT-BOOT
- **Provides:** every open line in /tmp/claude-0/plan/requests.jsonl resolved or re-routed to a W4 bucket
- **Notes:** Small hook-level edits only; anything larger becomes a W4 defect.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/validate_maps.mjs
  ```

#### QA-TOOLS — Final QA tooling: platform suite update, commands, perf budget, soak, visual review (M)

- **Spec:** platform §11 WP-10; MASTER_PLAN §5.1–5.3, §1.21
- **Owns:** `tools/qa/**`
- **Depends on:** PLAT-QA, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT-A, PLAT-FRONT-B, PLAT-ACCOUNT-UI, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES, PLAT-DIALOG, ART-KIT
- **Provides:** platform tests cover awaken/mount/guard bindings and the canvas touch buttons; tools/qa/commands.mjs (incl. d05/d19 from a standstill and the d14 vs sprint-attack timing), perf_budget.mjs (texture budget, #tpadcv DPR), soak.mjs, visual_review.mjs, bindings.mjs, hook_tags.mjs, painted_registry.mjs, run_all.mjs
- **Tests:**
  ```
  node tools/qa/run_platform.mjs
  node tools/qa/perf_budget.mjs --profiles desk --quick
  node tools/qa/bindings.mjs && node tools/qa/hook_tags.mjs && node tools/qa/painted_registry.mjs
  ```

#### FEEL-QA — Feel acceptance harness (M)

- **Spec:** feel §10
- **Owns:** `tools/feel_test.mjs` (new)
- **Depends on:** FEEL-MOVE, FEEL-HUD, FX-ULTS, FX-ULTKIT, AWAKEN-DIR-A, AWAKEN-DIR-B, OVERLAYS, PLAT-TOUCH, PLAT-QA
- **Provides:** M1–M6, C1–C15, U1–U2, A1–A8, V1 with /tmp/claude-0/qa_feel/report.json
- **Notes:** Failures found here are filed as W4 defects (the harness owner does not fix engine code). A7 drives the canvas pad through tools/qa/lib/touch.mjs (the DOM .b.ult button in feel §10 no longer exists after PLAT-TOUCH).
- **Tests:**
  ```
  node tools/feel_test.mjs
  ```

#### CMP-QA — Companion end-to-end, balance model, room-fit scan (M)

- **Spec:** companions §14 C10 (checklist 1–10); MASTER_PLAN §1.2 (P2 check points)
- **Owns:** `tools/test_companions.mjs` (new), `tools/balance_companions.mjs` (new), `tools/scan_mount_fit.mjs` (new)
- **Depends on:** CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-ART-B, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-TOWN, CMP-MOUNT-B
- **Provides:** C10 checklist incl. Part 2 companions (recruit flags, deep dismount, wind/blight multipliers)
- **Tests:**
  ```
  node tools/test_companions.mjs
  node tools/balance_companions.mjs
  node tools/scan_mount_fit.mjs
  ```

#### P2-QA — Part 2 acceptance suite, integration cases s14–s20, balance --check (L)

- **Spec:** world2 §15, §17; MASTER_PLAN §5.1
- **Owns:** `tools/test_part2.mjs` (new), `tools/integration.mjs`, `tools/balance.mjs`
- **Depends on:** MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, EXT-MUSIC-P2, MAPS-P2-D, BOSS-P2-KIT, PLAT-DIALOG, PLAT-FRONT-B
- **Provides:** test_part2.mjs (--static and runtime tests 4–12); integration.mjs STAGES += s14–s20 (+ boss rooms); balance.mjs Part 2 rows + --check
- **Tests:**
  ```
  node tools/test_part2.mjs --static
  node tools/test_part2.mjs
  node tools/integration.mjs --only s14,s15,s16,s17,s18,s19,s20,s14_boss,s20_boss
  node tools/balance.mjs normal kael --check
  ```

#### APK-FU — APK follow-ups: /api proxy, WebView gate, insets and rumble bridges, dist/web packing (L)

- **Spec:** platform §9.4 items 1–6, P-32/P-33/P-34; docs/ACCOUNTS.md §1 (proxy); MASTER_PLAN §1.20
- **Owns:** `android/**`, `tools/apk/**`
- **Depends on:** DELIVERY-WEB, EXT-APK
- **Provides:** AssetServer proxy of /api/* to the origin in tools/apk/api_origin.txt (placeholder until DELIVER-APK in W6); WebView ≥ 98 gate; __BN_INSETS + bn-insets; BNAndroid.rumble; WEB_FILES = dist/web minus sw.js and downloads/; MIME table; APK size check against ≤ 45 MB (painted) with the phone-density fallback (lo/ + painted td ≤ 0.75) when above
- **Notes:** Keystore handling unchanged (never generate a new key over an existing keystore.properties).
- **Tests:**
  ```
  node tools/deploy/build_web.mjs && tools/apk/build_apk.sh --verify
  node tools/apk/verify_apk.mjs
  ```

#### DOCS-ARCH — ARCHITECTURE.md update for every new contract (M)

- **Spec:** world2 WP-J docs; all four specs; MASTER_PLAN §1
- **Owns:** `docs/ARCHITECTURE.md`
- **Depends on:** FEEL-MOVE, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, ITEMS-P2, STORY-P2-A, PLAT-OPTIONS, WORLDMAP-P2, ART-KIT, PLAT-BOOT
- **Provides:** actions/bindings, settings, save v2, hooks, HUD regions, SFX, events, scenes, Part 2 ids/chars/gimmicks/scripts, companion ids, test commands
- **Notes:** Korean like the existing document.
- **Tests:**
  ```
  grep -c 'awakenCutin\|gimmickOf\|mt_warhorse\|settingsVersion' docs/ARCHITECTURE.md
  ```

### W4 — Final integration and QA: full regression, performance budgets, loop until dry

| key | title | size | depends on |
|---|---|---|---|
| **QA-ROUND** | Full regression round runner and triage (repeat per round) | M | ART-HERO-B, ART-BOSS-6, ART-BOSS-7, ART-BOSS-8, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH |
| **PERF-MOBILE** | Performance budget measurement on mobile settings (per round) | M | QA-ROUND |

The 16 fix buckets are spawned per round (one agent per bucket with defects). Their ownership globs are in §5.3; in the JSON each bucket is a package that depends on QA-ROUND.


#### QA-ROUND — Full regression round runner and triage (repeat per round) (M)

- **Spec:** MASTER_PLAN §5.1, §5.3
- **Owns:** no repository file
- **Depends on:** ART-HERO-B, ART-BOSS-6, ART-BOSS-7, ART-BOSS-8, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH
- **Provides:** /tmp/claude-0/qa/round_<N>/defects.json + screenshots + bucket assignment
- **Consumes:** every suite in §5.1
- **Notes:** Owns no repository file; writes only under /tmp/claude-0/qa/. Round 1 seeds defects.json with the open items from the integration notes that no earlier package owns, unless already fixed: s03 r2 black screen when loaded directly; merman/killer_fish placement on ~ tiles in s08; per-platform platRange/platSpeed; smith/shop registration in reg_town; Dracula phase-2 script b_dracula_transform; b_grimoire title in data/bosses_a.js; items m_bone icon; hidden rooms visible from outside.
- **Tests:**
  ```
  node tools/qa/run_all.mjs --round <N>
  ```

#### PERF-MOBILE — Performance budget measurement on mobile settings (per round) (M)

- **Spec:** MASTER_PLAN §5.2; feel §8; platform §1.3, §6.4; world2 §17 performance; companions §11
- **Owns:** no repository file
- **Depends on:** QA-ROUND
- **Provides:** /tmp/claude-0/qa/round_<N>/perf.json with budget verdicts; misses filed as S3 defects to the owning bucket
- **Notes:** Owns no repository file.
- **Tests:**
  ```
  node tools/qa/perf_budget.mjs --profiles phone1,phone2,tablet,desk,fhd2x
  ```

### W5 — Pre-release audit (read-only, after GATE:QA-DRY) and its fix round

| key | title | size | depends on |
|---|---|---|---|
| **AUDIT-ENGINE** | Audit: game engine and systems (read-only) | L | GATE:QA-DRY |
| **AUDIT-CONTENT** | Audit: bosses, AI, data and story flow (read-only) | L | GATE:QA-DRY |
| **AUDIT-RENDER** | Audit: renderers and art runtime (read-only) | L | GATE:QA-DRY |
| **AUDIT-UI** | Audit: scenes and UI flows (read-only) | L | GATE:QA-DRY |
| **AUDIT-PLATFORM** | Audit: platform, delivery and offline behaviour (read-only) | L | GATE:QA-DRY |
| **AUDIT-ACCOUNTS-SEC** | Audit: accounts, cloud save and security (read-only) | L | GATE:QA-DRY |
| **AUDIT-TRIAGE** | Audit triage, fix round and re-verification | M | AUDIT-ENGINE, AUDIT-CONTENT, AUDIT-RENDER, AUDIT-UI, AUDIT-PLATFORM, AUDIT-ACCOUNTS-SEC, QA-ROUND |

#### AUDIT-ENGINE — Audit: game engine and systems (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-engine.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (src/game/** except bosses/ai, src/core/{camera,particles,physics,lighting,math,events,audio,sfx_feel,audio_companions}.js, src/data/feel_*.js, src/data/awaken.js: soft-locks, state leaks across rooms/respawn, NaN/undefined paths, save-state integrity, timers during hitstop/cutscene). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-engine.json
  ```

#### AUDIT-CONTENT — Audit: bosses, AI, data and story flow (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-content.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (src/game/bosses/**, src/game/ai*.js, src/data/** (items, quests, stages, maps, story, companions): unreachable content, broken ids, progression dead ends, ending routes, balance cliffs). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-content.json
  ```

#### AUDIT-RENDER — Audit: renderers and art runtime (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-render.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (src/render/** incl. painted runtime and renderers: missing-asset fallbacks, memory/texture budget, per-frame allocations, visual mismatch between painted and vector). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-render.json
  ```

#### AUDIT-UI — Audit: scenes and UI flows (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-ui.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (src/scenes/**: every back/cancel path per device, scene-stack leaks, tap targets, text overflow, Korean text quality, pad-only and touch-only reachability). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-ui.json
  ```

#### AUDIT-PLATFORM — Audit: platform, delivery and offline behaviour (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-platform.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (src/core/{game,input,prompts,haptics,touchpad,platform,assets,save,ui}.js, src/main.js, src/boot-gate.js, index.html, css/**, sw.js, manifest, netlify.toml, tools/deploy/**, android/**, tools/apk/**: offline, storage eviction, SW update, APK back/insets/permissions, CSP/headers, keystore exposure). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-platform.json
  ```

#### AUDIT-ACCOUNTS-SEC — Audit: accounts, cloud save and security (read-only) (L)

- **Spec:** integration notes USER REQ (final): pre-release audit as lead engineer; MASTER_PLAN §5.3 severity
- **Owns:** no repository file
- **Depends on:** GATE:QA-DRY
- **Provides:** /tmp/claude-0/audit/audit-accounts-sec.json: findings {id, severity 치명적|높음|보통, area, file:line, user-facing effect, repro, suggested fix, priority}
- **Consumes:** the dry build of GATE:QA-DRY
- **Notes:** Read the whole area (netlify/**, src/core/cloud.js, account/cloud UI, docs/ACCOUNTS.md: auth and session handling, password hashing, rate limits, input validation, injection, secrets, CORS/CSP, data integrity (conflicts, partial writes, 512 KB limit), exception paths (logout, invalid input, offline, expired session)). Owns no repository file; never edits code (fixes go through the W4 buckets).
- **Tests:**
  ```
  test -s /tmp/claude-0/audit/audit-accounts-sec.json
  ```

#### AUDIT-TRIAGE — Audit triage, fix round and re-verification (M)

- **Spec:** MASTER_PLAN §5.3, §0.3 GATE:AUDIT-CLEAN
- **Owns:** no repository file
- **Depends on:** AUDIT-ENGINE, AUDIT-CONTENT, AUDIT-RENDER, AUDIT-UI, AUDIT-PLATFORM, AUDIT-ACCOUNTS-SEC, QA-ROUND
- **Provides:** /tmp/claude-0/audit/findings.json (deduped, severity, fix priority, bucket per finding); one W4 fix round for every bucket with 치명적/높음 findings, then a full QA-ROUND; GATE:AUDIT-CLEAN when that round is dry
- **Consumes:** every audit area file
- **Notes:** Owns no repository file. 보통 findings are fixed when cheap, otherwise listed as known issues for AUDIT-REPORT.
- **Tests:**
  ```
  node tools/qa/run_all.mjs --round audit
  ```

### W6 — Delivery (after GATE:AUDIT-CLEAN)

| key | title | size | depends on |
|---|---|---|---|
| **DELIVER-WEB** | Build dist/web, create the Netlify site, deploy with functions, smoke the deployment | M | GATE:AUDIT-CLEAN |
| **DELIVER-APK** | Final APK with the /api proxy to the live site | M | DELIVER-WEB |
| **DELIVER-ARTIFACT** | Republish the claude.ai artifact from the packed build (≤ 511 files) | M | GATE:AUDIT-CLEAN, DELIVER-WEB |
| **DELIVER-HANDOFF** | Keystore hand-off and release notes | S | DELIVER-APK, DELIVER-ARTIFACT |
| **AUDIT-REPORT** | Korean pre-release audit report (치명적 / 높음 / 보통) | S | AUDIT-TRIAGE, GATE:AUDIT-CLEAN |
| **QA-SIGNOFF** | Final smoke on the deployed site, the APK and the artifact | S | DELIVER-HANDOFF, AUDIT-REPORT |

#### DELIVER-WEB — Build dist/web, create the Netlify site, deploy with functions, smoke the deployment (M)

- **Spec:** platform §9.1–9.3; docs/ACCOUNTS.md; MASTER_PLAN §5.4 steps 2–4 and 7
- **Owns:** `netlify.toml`, `sw.js`, `robots.txt`, `tools/deploy/**`, `tools/assets/make_variants.py`, `assets/lo/**`, `dist/web/**`, `!dist/web/downloads/**`
- **Depends on:** GATE:AUDIT-CLEAN
- **Provides:** https://<site> live with /api/*; dist/web build report
- **Notes:** Starts only after GATE:AUDIT-CLEAN; delivery defects found before that were fixed by the W4 FIX-DELIVERY bucket.
- **Tests:**
  ```
  node tools/deploy/build_web.mjs
  node tools/deploy/smoke_deployed.mjs https://<site>
  ```

#### DELIVER-APK — Final APK with the /api proxy to the live site (M)

- **Spec:** platform §9.4; MASTER_PLAN §5.4 steps 5–6
- **Owns:** `android/**`, `tools/apk/**`, `dist/BloodNocturne.apk`, `dist/web/downloads/**`
- **Depends on:** DELIVER-WEB
- **Provides:** signed APK ≤ 45 MB (painted; ≤ 20 MB vector), versioned copy, latest.json
- **Notes:** DELIVER-WEB redeploys after this (step 7). dist/web/downloads/** is written here; DELIVER-WEB does not touch it.
- **Tests:**
  ```
  tools/apk/build_apk.sh --verify
  node tools/apk/verify_apk.mjs
  ```

#### DELIVER-ARTIFACT — Republish the claude.ai artifact from the packed build (≤ 511 files) (M)

- **Spec:** MASTER_PLAN §5.4 step 8; integration notes (artifact must include assets/fonts)
- **Owns:** `tools/artifact/**`, `dist/artifact/**`
- **Depends on:** GATE:AUDIT-CLEAN, DELIVER-WEB
- **Provides:** updated artifact (same URL) published in batches of ≤ 255 files / 64 MB from dist/artifact
- **Notes:** v1.0 planned to republish tools/artifact/blood_nocturne.html with its files; the tree already exceeds the 511-files-per-version limit, so the packed build is required.
- **Tests:**
  ```
  node tools/deploy/build_artifact.mjs --check
  ```

#### DELIVER-HANDOFF — Keystore hand-off and release notes (S)

- **Spec:** MASTER_PLAN §5.4 step 9; platform §9.4 item 7
- **Owns:** `docs/RELEASE.md` (new)
- **Depends on:** DELIVER-APK, DELIVER-ARTIFACT
- **Provides:** keystore + keystore.properties delivered privately; docs/RELEASE.md
- **Tests:**
  ```
  test -f tools/android/release.keystore && ! grep -qF "$(sed -n 's/^storePassword=//p' tools/android/keystore.properties)" docs/RELEASE.md   # the real password never appears (the word 'password' may)
  ```

#### AUDIT-REPORT — Korean pre-release audit report (치명적 / 높음 / 보통) (S)

- **Spec:** integration notes USER REQ (final): pre-release audit report in Korean; MASTER_PLAN §5.4 step 10
- **Owns:** `docs/AUDIT_REPORT.md` (new)
- **Depends on:** AUDIT-TRIAGE, GATE:AUDIT-CLEAN
- **Provides:** docs/AUDIT_REPORT.md: every finding by severity with fix priority, what was fixed and how it was re-verified, remaining 보통 items as known issues
- **Consumes:** /tmp/claude-0/audit/findings.json (AUDIT-TRIAGE)
- **Notes:** Korean like the existing docs; the lead publishes it with the release summary (open item: where).
- **Tests:**
  ```
  grep -c '치명적\|높음\|보통' docs/AUDIT_REPORT.md
  ```

#### QA-SIGNOFF — Final smoke on the deployed site, the APK and the artifact (S)

- **Spec:** MASTER_PLAN §5.3 last rule, §5.4 step 10
- **Owns:** no repository file
- **Depends on:** DELIVER-HANDOFF, AUDIT-REPORT
- **Provides:** sign-off report to the lead
- **Notes:** Owns no repository file.
- **Tests:**
  ```
  node tools/deploy/smoke_deployed.mjs https://<site> --full
  node tools/apk/verify_apk.mjs
  ```


---

## 4. File ownership matrix (shared or hot files)

"—" means the file is frozen in that wave (rule R14).

| file | W0 | W1 | W2 | W3 | W4 | W5 | W6 | external owner (§0.2) |
|---|---|---|---|---|---|---|---|---|
| `src/game/player.js` | — | GAME-HOOKS | FEEL-MOVE | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/world.js` | — | WORLD-CAM | — | HOOK-SWEEP | FIX-ENGINE | — | — | EXT-QAFIX |
| `src/game/combat.js` | — | FEEL-IMPACT | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/enemy.js` | — | FEEL-REACT | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/skills.js` | SKEL | — | FX-ULTS | HOOK-SWEEP | FIX-SYSTEMS | — | — | — |
| `src/game/state.js` | — | GAME-HOOKS | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/stats.js` | — | GAME-HOOKS | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/tilemap.js` | — | GIMMICK-ENGINE | — | HOOK-SWEEP | FIX-ENGINE | — | — | EXT-QAFIX |
| `src/game/props.js` | — | GIMMICK-ENGINE | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/game/ai.js` | SKEL | — | — | — | FIX-AI-BOSS | — | — | — |
| `src/game/quests.js` | — | — | ITEMS-P2 | — | FIX-SYSTEMS | — | — | — |
| `src/game/loot.js` | — | — | ITEMS-P2 | — | FIX-SYSTEMS | — | — | — |
| `src/game/bosses/index.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — | — |
| `src/game/bosses/boss.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — | — |
| `src/game/bosses/a_common.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — | EXT-ARTBAKEOFF |
| `src/game/bosses/b_common.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — | — |
| `src/game/bosses/a_bonedragon.js` | — | — | ART-BOSS-2 | — | FIX-AI-BOSS | — | — | EXT-ARTBAKEOFF |
| `src/core/game.js` | — | PLAT-CORE | — | HOOK-SWEEP | FIX-PLATFORM | — | — | EXT-QAFIX |
| `src/core/input.js` | — | PLAT-INPUT | — | HOOK-SWEEP | FIX-PLATFORM | — | — | EXT-ACCOUNTS |
| `src/core/ui.js` | — | FONTS-FU | — | HOOK-SWEEP | FIX-PLATFORM | — | — | EXT-FONTS |
| `src/core/save.js` | — | PLAT-SAVE-ASSETS | — | HOOK-SWEEP | FIX-PLATFORM | — | — | EXT-ACCOUNTS |
| `src/core/assets.js` | — | PLAT-SAVE-ASSETS | — | — | FIX-PLATFORM | — | — | EXT-ARTBAKEOFF |
| `src/core/audio.js` | — | AUDIO-FEEL | — | HOOK-SWEEP | FIX-AUDIO-MUSIC | — | — | — |
| `src/core/camera.js` | — | WORLD-CAM | — | HOOK-SWEEP | FIX-ENGINE | — | — | EXT-QAFIX |
| `src/core/particles.js` | — | FEEL-REACT | — | HOOK-SWEEP | FIX-ENGINE | — | — | — |
| `src/core/events.js` | SKEL | — | — | — | FIX-ENGINE | — | — | — |
| `src/main.js` | — | PLAT-BOOT | — | HOOK-SWEEP | FIX-PLATFORM | — | — | EXT-ACCOUNTS |
| `src/render/hero.js` | — | — | ART-HERO-A | ART-HERO-B | FIX-RENDER | — | — | EXT-ARTBAKEOFF |
| `src/render/hud.js` | — | HUD-LAYOUT | — | HUD-FINAL | FIX-HUD | — | — | — |
| `src/render/enemies.js` | — | FEEL-BOSSHOOKS | — | — | FIX-RENDER | — | — | EXT-ARTBAKEOFF |
| `src/render/enemies_a.js` | — | ART-ENEMY-SPLIT | ART-ENEMY-1 | — | FIX-RENDER | — | — | — |
| `src/render/enemies_b.js` | — | ART-ENEMY-SPLIT | ART-ENEMY-3 | — | FIX-RENDER | — | — | — |
| `src/render/tiles.js` | — | GIMMICK-RENDER | — | — | FIX-RENDER | — | — | — |
| `src/render/background.js` | — | GIMMICK-RENDER | — | — | FIX-RENDER | — | — | — |
| `src/render/icons.js` | — | — | ITEMS-P2 | — | FIX-RENDER | — | — | — |
| `src/scenes/index.js` | SKEL | — | — | HOOK-SWEEP | FIX-SCENES-A | — | — | — |
| `src/scenes/reg_town.js` | SKEL | — | — | — | FIX-SCENES-A | — | — | — |
| `src/scenes/stage.js` | — | PLAT-CORE | — | HOOK-SWEEP | FIX-SCENES-A | — | — | EXT-QAFIX |
| `src/scenes/overlays.js` | — | — | OVERLAYS | HOOK-SWEEP | FIX-SCENES-A | — | — | EXT-QAFIX |
| `src/scenes/dialogue.js` | — | — | PLAT-DIALOG | — | FIX-SCENES-A | — | — | EXT-QAFIX |
| `src/scenes/results.js` | — | — | PLAT-DIALOG | — | FIX-SCENES-A | — | — | — |
| `src/scenes/pause.js` | — | — | PLAT-DIALOG | — | FIX-SCENES-A | — | — | — |
| `src/scenes/title.js` | — | — | PLAT-FRONT-A | — | FIX-SCENES-A | — | — | EXT-ACCOUNTS |
| `src/scenes/front/story.js` | — | — | STORY-P2-A | — | FIX-SCENES-A | — | — | EXT-QAFIX |
| `src/scenes/front/ending.js` | — | — | STORY-P2-A | — | FIX-SCENES-A | — | — | — |
| `src/scenes/front/options.js` | — | — | PLAT-OPTIONS | — | FIX-SCENES-A | — | — | — |
| `src/scenes/front/arcade.js` | — | — | PLAT-FRONT-B | — | FIX-SCENES-A | — | — | — |
| `src/scenes/front/slots.js` | — | — | PLAT-FRONT-A | — | FIX-SCENES-A | — | — | EXT-ACCOUNTS |
| `src/scenes/town/hub.js` | — | — | PLAT-TOWN | — | FIX-SCENES-B | — | — | EXT-QAFIX |
| `src/scenes/town/worldmap.js` | — | — | WORLDMAP-P2 | — | FIX-SCENES-B | — | — | — |
| `src/scenes/town/facades.js` | — | — | CMP-TOWN | — | FIX-SCENES-B | — | — | — |
| `src/scenes/menu/menu.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | — | — |
| `src/scenes/menu/common.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | — | — |
| `src/scenes/menu/hero_view.js` | — | — | PLAT-TURNTABLE | — | FIX-SCENES-B | — | — | — |
| `src/scenes/menu/tab_system.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | — | EXT-ACCOUNTS |
| `src/data/story.js` | SKEL | — | STORY-P2-A | — | FIX-STORY | — | — | — |
| `src/data/stages.js` | SKEL | — | MAPS-P2-A (+ appends: MAPS-P2-B, MAPS-P2-C, MAPS-P2-D) | — | FIX-DATA | — | — | — |
| `src/data/items.js` | — | P2-DATA | ITEMS-P2 | — | FIX-DATA | — | — | — |
| `src/data/lore.js` | — | P2-DATA | ITEMS-P2 | — | FIX-DATA | — | — | — |
| `src/data/quests.js` | — | — | ITEMS-P2 | — | FIX-DATA | — | — | — |
| `src/data/town.js` | — | — | CMP-TOWN | — | FIX-DATA | — | — | EXT-QAFIX |
| `src/data/npcs.js` | — | — | CMP-TOWN | — | FIX-DATA | — | — | — |
| `src/data/music.js` | — | — | — | — | FIX-AUDIO-MUSIC | — | — | EXT-MUSIC-P2 |
| `src/data/enemies.js` | SKEL | — | — | — | FIX-DATA | — | — | — |
| `src/data/bosses.js` | SKEL | — | — | — | FIX-DATA | — | — | — |
| `index.html` | — | PLAT-BOOT | — | — | FIX-PLATFORM | — | — | — |
| `css/style.css` | — | PLAT-BOOT | — | — | FIX-PLATFORM | — | — | EXT-FONTS |
| `netlify.toml` | — | — | DELIVERY-WEB | — | FIX-DELIVERY | — | DELIVER-WEB | EXT-ACCOUNTS |
| `sw.js` | — | — | DELIVERY-WEB | — | FIX-DELIVERY | — | DELIVER-WEB | — |
| `package.json` | — | PLAT-QA | — | — | FIX-TOOLS | — | — | EXT-ACCOUNTS |
| `android/app/src/main/java/com/bloodnocturne/game/AssetServer.java` | — | — | — | APK-FU | FIX-DELIVERY | — | DELIVER-APK | EXT-APK |
| `tools/integration.mjs` | — | — | — | P2-QA | FIX-TOOLS | — | — | — |
| `tools/validate_maps.mjs` | — | GIMMICK-RENDER | — | — | FIX-TOOLS | — | — | — |
| `tools/balance.mjs` | — | — | — | P2-QA | FIX-TOOLS | — | — | — |
| `docs/ARCHITECTURE.md` | — | — | — | DOCS-ARCH | FIX-TOOLS | — | — | — |
| `src/core/platform.js` | SKEL | PLAT-BOOT | — | HOOK-SWEEP | FIX-PLATFORM | — | — | — |
| `src/game/bosses/c_common.js` | — | BOSS-P2-KIT | — | — | FIX-AI-BOSS | — | — | — |
| `src/render/painted/registry.js` | — | ART-KIT | — | — | FIX-RENDER | — | — | EXT-ARTBAKEOFF |
| `src/render/painted/enemies/index.js` | — | ART-KIT | — | — | FIX-RENDER | — | — | EXT-ARTBAKEOFF |
| `src/render/hero_puppet.js` | — | — | ART-HERO-A | ART-HERO-B | FIX-RENDER | — | — | EXT-ARTBAKEOFF |
| `tools/artifact/blood_nocturne.html` | — | — | — | — | FIX-DELIVERY | — | DELIVER-ARTIFACT | EXT-FONTS |

---

## 5. Final integration and QA (W4), pre-release audit (W5) and delivery (W6)

### 5.1 Full regression suite

The full suite runs every round, in this order. A round that stops early still reports every failure found so far.

| kind | command |
|---|---|
| static | `node tools/validate_maps.mjs  (all 20 stages + arena, 0 errors)` |
| static | `node tools/test_part2.mjs --static` |
| static | `python3 tools/fonts/build_fonts.py --check  (every Hangul syllable in src/** covered)` |
| static | `node tools/qa/hook_tags.mjs  (every [hook:*] tag count per file ≥ the W1 baseline, R4)` |
| static | `node tools/qa/bindings.mjs  (no binding collisions per preset; touch gaps ≥ 12 px and buttons ≥ 44 CSS px at every size class)` |
| static | `node tools/qa/painted_registry.mjs  (every registered painted id has its renderer module and assets; every reg/*.js imports in Node)` |
| unit | `node tools/test_save_v2.mjs (incl. ch20 save < 256 KB) && node tools/test_settings_v2.mjs && node tools/test_companion_state.mjs && npm run test:api` |
| unit | `node tools/test_sfx.mjs && node tools/test_hud_layout.mjs` |
| balance | `for c in kael sera victor bran lia azel; do node tools/balance.mjs normal $c --check; done  (+ hard/inferno printed for review)` |
| balance | `node tools/balance_companions.mjs && node tools/scan_mount_fit.mjs` |
| runtime desktop | `node tools/integration.mjs  (all cases: title, hub, worldmap, inn, arcade, menu, s01–s20, s01_boss–s20_boss)` |
| runtime mobile | `node tools/integration.mjs --mobile` |
| runtime Part 2 | `node tools/test_part2.mjs  (tests 4–12 of world2 §17: every P2 room, 7 gimmicks, 7 bosses × patterns × phases, flow, legacy save, 5 endings, items/quests, boss loot, mobile)` |
| runtime feel | `node tools/feel_test.mjs  (M1–M6, C1–C15, U1–U2, A1–A8, V1 screenshots)` |
| runtime companions | `node tools/test_mount.mjs && node tools/test_guardians.mjs && node tools/test_companions.mjs  (C10 checklist 1–10)` |
| runtime platform | `node tools/qa/run_platform.mjs  (pad, touch, view, menu, turntable, load, pwa; ≤ 12 min)` |
| runtime commands | `node tools/qa/commands.mjs  (every technique d02–d27 from a standstill and while running, incl. d05 ↓↙← and d19 →↓←↑, by keyboard, pad sectors and touch; →→+attack late in a sprint stays the dash attack)` |
| perf | `node tools/qa/perf_budget.mjs --profiles phone1,phone2,tablet,desk,fhd2x  (§5.2)` |
| soak | `node tools/qa/soak.mjs --minutes 10` |
| visual | `node tools/qa/visual_review.mjs  (contact sheets: every P2 room, 20 bosses × phases, 91 enemies, 20 companions, 6 heroes × 3 tiers × 8 yaws, 6 cut-ins at 960 and 1280, both ending cards, HUD matrix) — reviewed by opening the PNGs` |
| delivery | `node tools/deploy/build_web.mjs && node tools/qa/platform_load.mjs --dist && node tools/deploy/test_sw.mjs` |
| delivery | `tools/apk/build_apk.sh --verify && node tools/apk/verify_apk.mjs` |
| delivery | `node tools/deploy/build_artifact.mjs --check  (≤ 511 files, ≤ 256 MB, batches ≤ 255 files / 64 MB; boots with zero errors from dist/artifact)` |
| post-deploy | `node tools/deploy/smoke_deployed.mjs https://<site>` |

### 5.2 Performance budgets (mobile settings first)

**Profiles:** **phone1** 844×390 DPR 3, touch, CPU ×4 throttle, quality 'auto' (starts medium) and forced 'low'; **phone2** 740×360 DPR 3, touch, CPU ×4, quality 'auto'; **tablet** 1024×768 DPR 2, touch, quality 'auto'; **desk** 1280×720 DPR 1, keyboard + fake pad, quality 'high'; **fhd2x** 1920×1080 DPR 2, quality 'high' (pixel budget check)

**Scenes measured:** stage s05 stress (12 enemies + bursts), s17 r1 (wind), s20 r1 (void wall), s16 r2 (deep), each Part 2 boss room, one ultimate and one awakening per hero (tier 2 class), hub with a mount + 2 guardians, menu equip tab (turntable), title cold load (slow 4G / fast 4G); phone1 at medium with painted hero + 7 painted enemy types + painted boss resident (texture budget check).

| budget | target (high / medium / low where three values) | source |
|---|---|---|
| frame rate targets | 60 fps mid Android (2021+) at medium; ≥ 50 fps low-end at low; 60 fps desktop at high | feel §8, platform |
| ultimate / awakening frame cost (headless, relative) | average ≤ 1.5× gameplay average; p95 ≤ 2.5× gameplay median; no frame > 250 ms after the first 2 s of a stage (incl. first awakening) | feel §8 |
| sprint + 6 enemies hit at SSS | average ≤ 1.2× idle-walk average | feel §8 |
| particles live / per hit | fx.max 1400 / 900 / 500; per hit ≤ 28 / 18 / 10 (high / medium / low) | feel §8 |
| ultimate / awakening peak particles | ≤ 600 / 400 / 220 and ≤ 700 / 450 / 250 | feel §8 |
| damage numbers, afterimages, decals | 24/16/10, 8/5/3, 40/24/0 | feel §8 |
| full-screen passes, special composites, gradients | ≤ 3/2/1 per frame during ult/awakening; saturation/difference ≤ 2 frames per cast (none on low); ≤ 16/10/6 new gradients per frame | feel §8 |
| drawHero full redraws per frame | ≤ 10 / 6 / 3 | feel §8 |
| offscreen canvases created after stage start | 0 (pooled at init; painted kit bakes during load/boss intro only) | feel §8, painted kit rule 2 |
| SFX starts | ≤ 10 / 8 / 6 per 100 ms from feel code | feel §8 |
| backing store (pixel budget) | low ≤ 1.0 MP (DPR ≤ 1), medium ≤ 1.6 MP (DPR ≤ 1.5), high ≤ 3.7 MP (DPR ≤ 2) | platform §6.4 |
| 120 Hz displays | ≤ 61 render() calls per second with fpsCap 60 | platform §6.5 |
| menu equip tab at fhd2x high | ≤ 20 ms per frame (was 172) | platform WP-5 |
| hero turntable (yaw) | ≤ 1.5× side-view draw cost | platform §7.3 |
| gimmicks | update + draw ≤ 1.5 ms per frame on a mid phone at medium; s17 r1 and s20 r1 world.update + render ≤ 10 ms average over 300 frames at 1280×720 medium (headless) | world2 §0, §17 |
| companions | mount draw ≤ 0.35 ms, guardian draw ≤ 0.15 ms (high, headless); frame time delta with a mount + 2 guardians ≤ 1.5 ms | companions §11, §14 |
| creature art (TBD approach) | per-draw ≤ 1.5× today's renderer; painted: ≤ 15 MB textures per boss desktop, ≤ 6 MB phone; resident painted textures per scene (hero + stage enemies + boss + companions) ≤ 24 MB decoded on phone1/phone2, ≤ 64 MB desktop, enforced by the decoded LRU | this plan §1.15 |
| memory | decoded-image LRU budget 160 MB touch / 400 MB desktop; canvases ≤ 20 MB at phone1 with the menu open | platform §6.7, §1.5 |
| load | slow 4G first frame ≤ 9 s, fast 4G ≤ 2.5 s (serve_dist.mjs, brotli); critical path ≤ 1.6 MB brotli; first-frame fonts ≤ 500 KB; dist/web ≤ 90 MB (painted art) | platform §9.1, §8 |
| assets | bg ≤ 180 KB, cg ≤ 170 KB, P2 portraits ≤ 90 KB, companion portraits and cut-ins ≤ 250 KB, textures ≤ 60 KB, Part 2 total ≤ 6 MB | world2 §13.1, feel §6.6, companions §11.5 |
| APK | ≤ 45 MB with painted art, ≤ 20 MB vector (see §1.20) | platform WP-9, revised in review |
| touch overlay canvas #tpadcv | backing DPR ≤ the game canvas DPR cap (1.0 low, 1.5 medium); redraw ≤ 30 Hz and only on state change (a full-viewport DPR-3 overlay would add ≈ 3 MP of fill on phone1) | platform §5.2, review |
| artifact package | ≤ 511 files and ≤ 256 MB per version; publish batches ≤ 255 files / 64 MB | artifact limits, review |
| soak | 10-minute scripted soak (stage ↔ hub ↔ menu loops): JS heap and live canvas count stable (±10%), zero errors | this plan |

### 5.3 Loop-until-dry QA procedure

1. Round N starts with QA-ROUND: run the whole §5.1 matrix on a fresh server and write /tmp/claude-0/qa/round_<N>/defects.json: [{id, sev S1-S4, suite, repro (URL + steps or command), expected, actual, files[], bucket}] plus screenshots.
2. Severity: S1 crash, soft-lock, data loss, security or deploy exposure; S2 broken feature or wrong flow, console error, spec acceptance failure; S3 visual/audio defect, balance outside targets, perf budget miss; S4 polish (logged, fixed only if trivial).
3. Triage: dedupe against earlier rounds, map every defect to exactly one bucket by its primary file (bucket globs above partition every source file). Cross-bucket defects go to the bucket of the file where the fix belongs; follow-ups are ticketed for the next round.
4. Spawn at most one FIX-<bucket> agent per bucket that has S1-S3 defects (≤ 10 at a time). Each FIX agent edits only its bucket's files, re-runs the failing tests plus `node tools/integration.mjs` for its area, and reports fixed / not reproducible / needs another bucket.
5. Delivery defects (build_web, service worker, netlify.toml, APK, artifact page, font subsets) go to the FIX-DELIVERY bucket like any other bucket. The font coverage check fails until the Korean subsets are rebuilt from the final text, so FIX-DELIVERY rebuilds them in the first round.
6. The next round re-runs everything (not only the failed suites). The loop is dry when a full round reports zero S1-S3 defects and no source edit landed after the round started; that opens GATE:QA-DRY. Cap: 6 rounds; after that the lead decides which remaining S3 items become known issues.
7. W5 (pre-release audit) starts after GATE:QA-DRY; its findings are fixed through these same buckets and end with one more dry round (GATE:AUDIT-CLEAN). W6 (delivery) starts only after GATE:AUDIT-CLEAN. QA-SIGNOFF re-runs the smoke subset on the deployed site, the APK and the artifact; any S1/S2 found there reopens one W4 round for the owning bucket, then the affected W6 step repeats.

**Fix buckets** (their globs partition every source file, so two fix agents never share a file within a round)

| bucket | owns (globs) |
|---|---|
| FIX-ENGINE | `src/game/world.js`, `src/game/player.js`, `src/game/combat.js`, `src/game/enemy.js`, `src/game/impact.js`, `src/game/style.js`, `src/game/feel_move.js`, `src/game/awaken*.js`, `src/game/projectiles.js`, `src/game/pickups.js`, `src/game/props.js`, `src/game/tilemap.js`, `src/game/entity.js`, `src/game/stats.js`, `src/game/state.js`, `src/game/gimmicks*.js`, `src/core/camera.js`, `src/core/particles.js`, `src/core/physics.js`, `src/core/lighting.js`, `src/core/math.js`, `src/core/events.js`, `src/data/feel_move.js`, `src/data/feel_hit.js`, `src/data/awaken.js` |
| FIX-SYSTEMS | `src/game/skills.js`, `src/game/skills_p2.js`, `src/game/loot.js`, `src/game/quests.js`, `src/game/progression.js`, `src/game/inventory.js`, `src/game/enhance.js` |
| FIX-AI-BOSS | `src/game/ai*.js`, `src/game/bosses/**` |
| FIX-COMPANIONS | `src/game/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `src/game/mount*.js`, `src/game/guardian*.js`, `src/data/companions.js`, `src/data/story_companions.js`, `src/render/mount_rig.js`, `src/render/mounts*.js`, `src/render/guardians*.js`, `src/render/companion_hud.js`, `src/scenes/companion_join.js`, `src/scenes/menu/tab_companions.js`, `src/scenes/town/stable.js`, `src/core/audio_companions.js`, `src/render/painted/companions/**` |
| FIX-RENDER | `src/render/**`, `!src/render/mount_rig.js`, `!src/render/mounts*.js`, `!src/render/guardians*.js`, `!src/render/companion_hud.js`, `!src/render/hud.js`, `!src/render/hud_layout.js`, `!src/render/feel_hud.js`, `!src/render/painted/companions/**` |
| FIX-HUD | `src/render/hud.js`, `src/render/hud_layout.js`, `src/render/feel_hud.js` |
| FIX-DATA | `src/data/**`, `!src/data/story.js`, `!src/data/story_p2.js`, `!src/data/story_p2b.js`, `!src/data/companions.js`, `!src/data/story_companions.js`, `!src/data/feel_move.js`, `!src/data/feel_hit.js`, `!src/data/awaken.js`, `!src/data/controls.js`, `!src/data/music.js` |
| FIX-STORY | `src/data/story.js`, `src/data/story_p2.js`, `src/data/story_p2b.js` |
| FIX-SCENES-A | `src/scenes/*.js`, `src/scenes/front/**`, `!src/scenes/companion_join.js`, `!src/scenes/front/account.js`, `!src/scenes/front/cloud_ui.js` |
| FIX-SCENES-B | `src/scenes/town/**`, `src/scenes/menu/**`, `src/scenes/games/**`, `!src/scenes/town/stable.js`, `!src/scenes/menu/tab_companions.js` |
| FIX-PLATFORM | `src/core/game.js`, `src/core/input.js`, `src/core/prompts.js`, `src/core/haptics.js`, `src/core/touchpad.js`, `src/core/platform.js`, `src/core/assets.js`, `src/core/save.js`, `src/core/ui.js`, `src/main.js`, `src/boot-gate.js`, `index.html`, `css/**`, `manifest.webmanifest`, `src/data/controls.js` |
| FIX-AUDIO-MUSIC | `src/core/audio.js`, `src/core/sfx_feel.js`, `src/data/music.js` |
| FIX-ACCOUNTS | `netlify/functions/**`, `netlify/lib/**`, `src/core/cloud.js`, `src/scenes/front/account.js`, `src/scenes/front/cloud_ui.js`, `tools/accounts/**`, `docs/ACCOUNTS.md` |
| FIX-TOOLS | `tools/**`, `package.json`, `docs/ARCHITECTURE.md`, `package-lock.json`, `.gitignore`, `docs/art/**`, `!tools/deploy/**`, `!tools/apk/**`, `!tools/artifact/**`, `!tools/fonts/**`, `!tools/kling/**`, `!tools/blender/**`, `!tools/painted/**`, `!tools/puppet/**`, `!tools/assets/make_variants.py`, `!tools/android/**`, `!tools/accounts/**` |
| FIX-ASSETS | `assets/**`, `tools/kling/**`, `tools/blender/**`, `tools/painted/**`, `tools/puppet/**`, `!assets/fonts/**`, `!assets/lo/**` |
| FIX-DELIVERY | `netlify.toml`, `sw.js`, `robots.txt`, `tools/deploy/**`, `tools/assets/make_variants.py`, `assets/lo/**`, `android/**`, `tools/apk/**`, `tools/artifact/**`, `assets/fonts/**`, `tools/fonts/**` |

### 5.4 Delivery steps (W6, after GATE:AUDIT-CLEAN)

| step | package | action |
|---|---|---|
| 1 | DELIVER-WEB | Confirm python3 tools/fonts/build_fonts.py --check is green (it was part of the dry round; the subsets were rebuilt by FIX-DELIVERY) and first-frame fonts ≤ 500 KB. |
| 2 | DELIVER-WEB | node tools/deploy/build_web.mjs (regenerates assets/lo/ via make_variants.py first) → dist/web; deny check and size report must pass. |
| 3 | DELIVER-WEB | Create the Netlify site (Netlify connector/CLI) linked to this repo's build settings (publish dist/web, functions netlify/functions, Node 22); optional AUTH_PEPPER env; deploy with `netlify deploy --build --prod` (never --dir .). Verify GET /api/health → {ok:true, api:1}. |
| 4 | DELIVER-WEB | node tools/deploy/smoke_deployed.mjs https://<site>: headers (§9.2), SW registration, manifest installability, zero page errors on title/hub/stage, account signup/login/cloud save round trip on a throwaway id (then delete it). |
| 5 | DELIVER-APK | Write https://<site> into tools/apk/api_origin.txt; tools/apk/build_apk.sh --verify (WEB_FILES = dist/web minus sw.js and downloads/); aapt2 badging, apksigner v2/v3, zipalign, verify_apk.mjs with __BN_APP and __BN_INSETS 47/47/0/21; /api proxy check against the live site; ≤ 45 MB (§1.20). |
| 6 | DELIVER-APK | Copy the APK to dist/web/downloads/BloodNocturne.apk and BloodNocturne-<versionName>-<versionCode>.apk; write latest.json {versionName, versionCode, sha256, bytes, url}. |
| 7 | DELIVER-WEB | Redeploy (same command) so /apk and /download resolve; smoke_deployed.mjs again (/apk → 302 → APK content type). |
| 8 | DELIVER-ARTIFACT | node tools/deploy/build_artifact.mjs --check, then publish dist/artifact/ to the existing artifact URL in batches of ≤ 255 files / 64 MB (the page first, then the chunks, packs and fonts); open it and confirm title → hub → stage works, accounts hidden, zero errors. |
| 9 | DELIVER-HANDOFF | Send tools/android/release.keystore and keystore.properties to the user privately (file hand-off, never published/committed); write docs/RELEASE.md: site URL, APK URL and sha256, versionName/Code, rebuild steps, keystore backup instructions (no password). |
| 10 | AUDIT-REPORT | Write docs/AUDIT_REPORT.md in Korean: every audit finding by severity (치명적/높음/보통) with fix priority, what was fixed and how it was re-verified, remaining 보통 items as known issues; the lead publishes it with the release summary. |
| 11 | QA-SIGNOFF | Re-run the smoke subset on the deployed site (desktop + phone emulation + fake pad), the APK (verify_apk) and the artifact; publish the release summary to the lead. |

### 5.5 Sign-off checklist (the user's 14 requests, accounts and the final audit)

| request | packages | evidence |
|---|---|---|
| 1 more detailed 2D characters | ART-HERO-A, ART-HERO-ASSETS-1…3, ART-NPC, ART-HERO-B (approach TBD; notes: painted) | visual_review contact sheet (6 heroes × 3 tiers), tools/gallery_hero.html |
| 2 grotesque, boss-like bosses | ART-BOSS-1…8, BOSS-P2-KIT, BOSS-P2-1…4 (approach TBD) | visual_review (20 bosses × phases), integration boss rooms |
| 3 more volume: other worlds after chapter 13 | P2-DATA, GIMMICK-*, MAPS-P2-A…D, BOSS-P2-KIT, ENEMY-P2-*, BOSS-P2-*, STORY-P2-*, ITEMS-P2, WORLDMAP-P2, EXT-MUSIC-P2, EXT-P2-KLING/BLENDER | test_part2.mjs, validate_maps, balance --check |
| 4 mounts and guardians that ride/fight with you | CMP-DATA, CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-B, CMP-*-ART, CMP-UI, CMP-TOWN, AUDIO-CMP, EXT-CMP-ART | test_companions.mjs, test_mount.mjs, test_guardians.mjs, balance_companions.mjs |
| 5 walking/running feel, arcade punch, DNF-style hits | FEEL-MOVE, FEEL-IMPACT, FEEL-REACT, FEEL-BOSSHOOKS, FEEL-HUD, AUDIO-FEEL | feel_test.mjs M1–M6, C1–C15 |
| 6 rotate the hero in the inventory (front/back) | PLAT-TURNTABLE, ART-HERO-B | tools/qa/turntable.mjs (acceptance 1–6) |
| 7 mobile touch that works well | PLAT-TOUCH, PLAT-CORE, PLAT-BOOT, PLAT-MENU, PLAT-FRONT-A/B, PLAT-ACCOUNT-UI, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES, PLAT-DIALOG | run_platform.mjs (touch, taps, safe area), integration --mobile |
| 8 controller support | PLAT-INPUT, prompts/glyphs in every UI package | platform_pad.mjs, pad-only walkthroughs |
| 9 blood-themed fonts | EXT-FONTS, FONTS-FU, bloodText call-site owners (§1.16), FIX-DELIVERY subset rebuild (W4) | build_fonts.py --check, visual review |
| 10 flashier impact and ultimates | FX-ULTKIT, FX-ULTS, OVERLAYS, FEEL-IMPACT | feel_test.mjs U1, U2, V1 |
| 11 true super ultimate with illustration and signature line | AWAKEN-CORE, AWAKEN-DIR-A/B, EXT-CUTIN-ART | feel_test.mjs A1–A8, V1 |
| 12 Netlify link and APK | DELIVERY-WEB, APK-FU, DELIVER-WEB, DELIVER-APK, DELIVER-ARTIFACT, DELIVER-HANDOFF | smoke_deployed.mjs, verify_apk.mjs |
| 13 optimized on mobile and desktop | PLAT-CORE, PLAT-BOOT, PLAT-SAVE-ASSETS, DELIVERY-WEB, PERF-MOBILE | perf_budget.mjs (§5.2), platform_load.mjs |
| 14 no errors (developer-level QA) | W4 QA loop, W5 pre-release audit, all harnesses | GATE:QA-DRY, GATE:AUDIT-CLEAN |
| kept: class change and equipment change the look | ART-HERO-A, ART-HERO-ASSETS-1…3 (must_keep) | tools/.proto_ART-HERO-A/equip.mjs (every slot and class change alters the pixels in both paths), visual_review, gallery_hero equipment rows |
| kept: arcade feel, 5 difficulty levels, saving, mobile play, no visual mismatch | all; save v2 + cloud (GAME-HOOKS, EXT-ACCOUNTS) | integration, test_save_v2, balance --check per difficulty, visual_review |
| accounts: ID/password and cloud save (user request, in progress) | EXT-ACCOUNTS, PLAT-ACCOUNT-UI, FIX-ACCOUNTS, AUDIT-ACCOUNTS-SEC, DELIVER-WEB (functions), APK-FU/DELIVER-APK (/api proxy) | npm run test:api, smoke_deployed.mjs account round trip, verify_apk.mjs /api proxy check |
| final: pre-release audit report in Korean (치명적/높음/보통) | AUDIT-* (W5), AUDIT-REPORT (W6) | docs/AUDIT_REPORT.md, GATE:AUDIT-CLEAN |

---

## 6. Open items for the lead

- GATE:ART-DECISION: confirm the 'painted' outcome recorded in the integration notes for heroes and creatures (or switch to 'vector_hd'), the hero puppet runtime file (src/render/hero_puppet.js) and the 8-direction turntable view set.
- Kling credit budget per art package (painted): 5 heroes ≈ 200 images, 12 + 7 bosses, 62 + 24 enemies, 20 companions, 7 NPCs.
- Confirm that EXT-P2-BLENDER and EXT-MUSIC-P2 are still running (EXT-CUTIN-ART, EXT-P2-KLING and EXT-CMP-ART finished in commit d0347c9); spawn them from their external entries if not.
- Netlify account/team to create the site in; whether to connect Git builds or deploy from this container.
- APK size: platform's 20 MB assumed vector art; with painted art this plan uses ≤ 45 MB (phone-density atlases above that). Confirm or set another limit.
- Where the Korean pre-release audit report goes (docs/AUDIT_REPORT.md in the repo, a published page, or both).
- Whether to normalize companion portrait file names (cmp_m_* → cmp_mt_*) (optional, FIX-ASSETS in W4).

---

## 7. Review log (v1.1)

An adversarial review of v1.0 against the four specs, the user requests, the lead's integration notes and the code (player.js, world.js, hero.js, input.js, game.js, hud.js, state.js, the painted runtime) found the problems below; each fix is already applied in the sections above and in the JSON.

| # | problem | evidence | fix |
|---|---|---|---|
| 1 | HUD table overlapped itself | The v1.0 §1.8 table failed its own no-overlap acceptance: modelled at desk960 it had 7 overlaps (centre stack over the hearts row and companion widgets; announcer over the gauges, ready text, companion widgets, combo column and call-out lane) and at phone2 (vw 1110) 6–9 (touch boss bar over the companion widgets; combo column over the swap/skill2/sub/guard pad buttons; stack under the Ⅱ/가방 buttons). The acceptance only used 960/1280 widths, but phones are 1110–1168 logical px wide and the pad covers x ≥ 674, y ≥ 186 on phone2. | New table (hearts to x 350, companions x 244–372, one transient slot at y 230–294, top/bottom boss slot chosen from pad rects, toasts inside the centre gap, combo bottom from padTop), touchpad.occupiedRects() as input, and a test matrix with phone1/phone2/tablet and the real pad rects. The review model of the new table has 0 overlaps. |
| 2 | Wrong touch-gap claim | v1.0 said the minimum gap of the touch layout is 22 px; attack–dash is 19.2 px (platform §5.2 says 19). | Corrected (19.2 px; companion buttons ≥ 22 px; acceptance ≥ 12 px and ≥ 44 CSS px). |
| 3 | Command facing bug (Part 1) | input.command maps f/b with the facing at the attack press, but Player.update turns the hero as soon as a back direction is held, so d05 ↓↙← and d19 →↓←↑ cannot fire from a standstill today; v1.0 only swapped d21 and deferred d05 to a W4 check. | input.command evaluates f/b against the facing at the first direction (p.facingAt ring) in W1 (PLAT-INPUT + GAME-HOOKS); commands.mjs covers d05/d19 from a standstill. |
| 4 | d14 swallowed the sprint dash attack | The v1.0 precedence (command before sprint attack) made →→+attack always 수룡참 once learned, removing the DNF dash attack to the right. | →→ then attack within 0.25 s = d14; later attacks while sprinting = dash attack. |
| 5 | Hitstop eats input edges | world.update() skips the entity loop during hitstop (S 0.25 s, A 0.40 s) while input.update() keeps stepping, so a release during a freeze is never seen: the awakening tap/cancel window, swap long-press and double-tap sprint would misfire. | Rule R16 + §1.4: level state + pressTime/releasedAt, hold cancelled on a missed frame or scene push. |
| 6 | Mount charge braked by movement block | Hook #4/#5 let the normal horizontal control run during a mount charge (only dashT was excluded), so approach() would brake the charge every frame. | Movement block skipped while mount.chargeT > 0; updateCharge sits in hook #4. |
| 7 | Link-time crash risk from new exports | AWAKEN-CORE imports FXKIT from skills.js but did not depend on FX-ULTS; PLAT-CORE used ui.setTextFloor without depending on FONTS-FU; PLAT-TURNTABLE (W2) reads HERO_VIEW, a W3 export; BOSS-P2-2/3/4 imported c_common.js owned by BOSS-P2-1 in the same wave with no dependency. A missing named export stops the whole game. | R6 extended (dependency or W0 placeholder or namespace import; no export removal before W4); SKEL adds FXKIT = {}; PLAT-CORE depends on FONTS-FU; PLAT-TURNTABLE uses a namespace import; new W1 package BOSS-P2-KIT owns c_common.js and the C/D galleries. |
| 8 | Painted paths did not match the pipeline | ART-BOSS/ART-ENEMY owned assets/painted/b_<id>/**, tools/painted/b_<id>/**, assets/painted/enemies_a/**; the bake-off layout is assets/painted/{bosses,enemies}/<id>/, src/render/painted/{bosses,enemies}/<id>.js, tools/painted/{configs,poses,raw,enemies}/…, and nobody owned the per-creature renderer files. | Per-id ownership for every boss, enemy and companion (§1.15 rule), per-package prompts and manifests. |
| 9 | Shared painted registries frozen in W2 | registry.js (one registerPainted line per boss) and painted/enemies/index.js (one import per enemy) were owned by ART-KIT in W1 and nobody in W2, although ~20 art packages must register creatures there. | ART-KIT turns them into aggregators over src/render/painted/reg/<key>.js stubs, one per art package (R15). |
| 10 | Part 2 gameplay blocked by the art gate | The bosses/index.js and render/enemies.js C/D merges lived in ART-KIT (after GATE:ART-DECISION), and BOSS-P2-1…4 depended on ART-KIT, so Part 2 bosses could not run until the art decision. | FEEL-BOSSHOOKS (after the bake-off, not the gate) owns the merges; BOSS-P2-* depend on BOSS-P2-KIT and draw in vector; painted Part 2 boss art moves to new W3 packages ART-BOSS-6…8. |
| 11 | Oversized packages | PLAT-CORE (10 files, ~20 deliverables), PLAT-FRONT (12 files), PLAT-GAMES (games + pause + dialogue + results), CMP-MOUNT (9 mounts), MAPS-P2-A (3 stages, 18 rooms) and ART-ENEMY-4 (19 enemies), plus ART-HERO-A (6 heroes × 7 painted classes ≈ 230–260 Kling images in one package). | Split: PLAT-CORE/PLAT-BOOT, PLAT-FRONT-A/B + PLAT-ACCOUNT-UI, PLAT-GAMES/PLAT-DIALOG, CMP-MOUNT/CMP-MOUNT-B, MAPS-P2-A…D (2/2/2/1), ART-ENEMY-4/5, ART-HERO-A + ART-HERO-ASSETS-1…3 + ART-NPC. |
| 12 | Unrealistic art estimates | Every art package was sized L although painted production is ≈ 1.5–2 agent-hours per creature (the bake-off needed 4 tasks for one boss). | Painted art packages are XL with per-creature checkpoints (R15); L in vector_hd mode. |
| 13 | Missing art scope | No NPC art (NPCs draw through drawHero and would look like stickers next to painted heroes: kept requirement 시각적 이질감 없음), no painted art for the 7 Part 2 bosses, no painted paths for companions. | ART-NPC (W2), ART-BOSS-6…8 (W3), painted ownership for the 4 companion art packages; drawHero dispatch step 0 (heroes, NPCs, snapshots, menus, shadow_hunter). |
| 14 | Stale external status | EXT-CUTIN-ART, EXT-P2-KLING and EXT-CMP-ART were "observed in flight"; the notes and commit d0347c9 show them done, so AWAKEN-CORE was needlessly blocked. The bake-off also edits src/core/assets.js and the accounts work edits src/main.js (cloud.init), neither listed. | Statuses updated; EXT-ARTBAKEOFF owns assets.js (PLAT-SAVE-ASSETS depends on it), EXT-ACCOUNTS owns main.js (PLAT-BOOT depends on it). |
| 15 | Tests without their harness | A provenance check of every test command found 10 violations: PLAT-INPUT, PLAT-TOUCH and PLAT-CORE (W1, same wave as PLAT-QA) and DELIVERY-WEB, PLAT-MENU, PLAT-FRONT, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES (W2, early start allowed by R2) ran tools/qa/* scripts owned by PLAT-QA without depending on it; FEEL-QA A7 presses the DOM .b.ult button that PLAT-TOUCH removes; BOSS-P2-2 tested with a gallery owned by BOSS-P2-1. | Dependencies added; A7 drives the canvas pad via tools/qa/lib/touch.mjs; galleries moved to BOSS-P2-KIT. The generator now checks that every tools/* test script exists or is owned by the package or its dependency closure. |
| 16 | Legacy DOM pad consumers | world.stickRect() reads DOM #stick, hub.townPad hides combat buttons through DOM #btns, and front/menu/games helpers toggle #touch; PLAT-TOUCH removes that DOM in W1 with no replacement contract. | touchpad.occupiedRects()/stickZone(), scene flag padHideButtons, and per-owner migration (WORLD-CAM, PLAT-TOWN, PLAT-FRONT-A, PLAT-MENU, PLAT-GAMES). |
| 17 | Q/E menu tabs and L3 | Q and E both map to swap, so resolving menu tabs from swap would make Q go forward; L3 = mount is easy to click by accident while running. | prevTab = Q/S/LB and nextTab = E/D/RB stay distinct; L3 accepted only with the stick inside 0.6 or held 0.25 s; tools/qa/bindings.mjs checks collisions per preset. |
| 18 | Survival spawns gimmick enemies | STAGE_ORDER gains s14–s20, and arcade_run survival picks enemies by STAGE_ORDER tier, so later waves would spawn swimmers and ceiling-bound Part 2 enemies in the arena; other STAGE_ORDER consumers were not reviewed. | def.noArena (P2-DATA), survival uses STAGE_ORDER_P1 unless p2Known (PLAT-FRONT-B), consumer list with owners in §1.14. |
| 19 | Artifact cannot hold the game | A claude.ai artifact version holds ≤ 511 files; the tree already has ≈ 600 runtime files and painted art adds hundreds; the hand-kept blood_nocturne.html still carries the legacy #touch DOM. | build_artifact.mjs (module chunks + asset packs + generated page), assets.js pack support, batch publishing, --check in the regression suite. |
| 20 | Delivery size budgets | APK ≤ 20 MB and dist/web ≤ 60 MB predate the painted decision (Kael's 7 puppet classes alone are ≈ 3 MB). | APK ≤ 45 MB with a phone-density fallback, dist/web ≤ 90 MB, painted texture residency budget (24 MB phone / 64 MB desktop), #tpadcv DPR cap; open item for the lead. |
| 21 | Pre-release audit missing | The notes' final user request (lead-engineer audit of the whole codebase incl. security, data integrity and exception paths; Korean report by 치명적/높음/보통; fix and re-verify) had no package. | New W5 (six read-only area audits + AUDIT-TRIAGE with a fix round and GATE:AUDIT-CLEAN) and AUDIT-REPORT in W6; delivery moves to W6. |
| 22 | Equipment look untested for painted heroes | The kept requirement 장비가 캐릭터 외형에 반영 had no acceptance once heroes become painted puppets (fixed per-class paintings; the notes list only recolour masks, procedural weapons and cape). | ART-HERO-A provides the painted equipment set (weapon, armour tint, cape, headgear overlays, wings/halo/aura, rift shimmer) and tests that every slot and class change alters the pixels in both paths. |
| 23 | Known defects without an owner | Several open items in the integration notes touch files no package owns before W4 (s03 r2 black screen, merman/killer_fish on ~ tiles in s08, per-platform platRange/platSpeed, smith/shop registration, Dracula phase-2 script, b_grimoire title, m_bone icon, hidden rooms visible from outside). | QA-ROUND seeds round 1 with them so a fix bucket picks each one up. |
| 24 | Weak checks | The keystore hand-off test failed on any use of the word "password"; save size vs the accounts 512 KB limit, hook-tag survival and bucket coverage of package-lock.json/.gitignore/docs/art were unchecked. | The test greps for the real password value; save-size assertion, hook_tags.mjs, painted_registry.mjs; buckets extended (and mount*.js, painted companions). |
