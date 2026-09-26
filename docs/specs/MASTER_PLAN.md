# BLOOD NOCTURNE — Master Build Plan (expansion phase 2)

Plan version 1.0, 2026-09-26. Repository `/home/user/game`, snapshot git HEAD 2c759a8 (13:56 UTC autosave) plus 50 uncommitted in-flight paths.

This plan merges the four new specs into one build order that about ten agents can run in parallel without editing the same file at the same time. It covers the cross-spec decisions (section 1), the waves and their work packages (sections 2 to 4), and the final integration and QA wave with its closing delivery step (section 5: W4 and W5).

- **Inputs:** `docs/ARCHITECTURE.md`, `docs/specs/feel.md`, `docs/specs/platform.md`, `docs/specs/world2.md`, `docs/specs/companions.md`, `/tmp/claude-0/user_request_2.md`, `/tmp/claude-0/integration_notes.md`.
- **Machine-readable twin:** `docs/specs/master_plan.json`. Both files are generated from one source. If an id or path differs between them, the JSON wins.
- **Package sizes:** S = under 1 agent-hour; M = 1 to 2.5 agent-hours; L = 2.5 to 5 agent-hours; XL = over 5 agent-hours (not used: every XL was split).
- **Dependency keys:** a package key; `EXT-*` for work already in flight (§0.2); `GATE:*` for a decision or QA gate (§0.3).
- **`owns` globs:** `**` matches any depth. A leading `!` removes paths from the package's earlier globs (gitignore style).

---

## 0. How to run this plan

### 0.1 Orchestration rules

1. **R1 one owner.** Every file that changes has exactly one owning package per wave (see owns). Other packages in the same wave may only add the append-only hunks listed under appends, placed directly after the given anchor line.
2. **R2 soft barrier.** Waves are soft barriers. A package may start as soon as all of its depends_on are finished AND no file it owns is still owned by a running package of an earlier wave. External (EXT-*) and gate (GATE:*) dependencies must be satisfied as stated in external_packages and gates.
3. **R3 edit style.** Re-read a file right before editing it; use exact string-replacement edits; never reformat, re-indent or rewrite a shared file wholesale; never revert other agents' changes. New files may be written whole.
4. **R4 hook tags.** Every cross-feature hook line carries a trailing tag comment: // [hook:feel] [hook:awaken] [hook:gimmick] [hook:cmp] [hook:plat] [hook:p2]. Later owners must keep tagged lines (move them with the code if they refactor).
5. **R5 stubs.** W0 SKEL creates every new module that another package imports before its owner lands, with the full contracted export list as no-ops and the header '// STUB (W0 SKEL) — owner: <KEY>'. The owner replaces the whole file. Stubs must preserve today's behavior (for example the awaken.js stub fires the normal ultimate).
6. **R6 defensive calls.** Calls into another package use optional chaining (world.gimmickOf?.('wind'), game.companions?.recruit?.(id)). Never access an imported value at module top level (circular-import rule from ARCHITECTURE.md).
7. **R7 requests.** If a package needs a change in a file it does not own, it appends one JSON line {from, file, owner, what, why} to /tmp/claude-0/plan/requests.jsonl, codes defensively, and continues. Owners read the file when they start and before they finish. Unresolved requests roll into W3 HOOK-SWEEP, then into the W4 fix buckets.
8. **R8 tests before done.** A package is done only when its tests pass, `node tools/integration.mjs` passes for the areas it touches, and the smoke runs it lists show zero pageerror or console errors. Screenshots go to /tmp/claude-0/proto/<KEY>/, throwaway scripts to tools/.proto_<KEY>/ (git-ignored).
9. **R9 no commits.** Do not git commit (the autosave commits). No npm dependencies. No build step for the game itself (only tools/deploy/build_web.mjs for delivery).
10. **R10 Korean text.** Player-facing strings are natural Korean; strings quoted verbatim in a spec are copied verbatim. Use FONT.* and ui.text/bloodText only; never hard-code font families.
11. **R11 art assets.** Kling/Blender work writes its own manifest file (tools/kling/manifest_<pkg>.json); nobody edits the shared tools/kling/manifest.json or cleaned.json. Every visual must render without its image (procedural or hidden fallback).
12. **R12 performance.** New per-frame work uses cached sprites/gradients, scales particle counts by world.fx.quality, honors settings.quality/reduceMotion/flashFx, and stays inside §5.2 budgets.
13. **R13 report.** Each package ends with a short report: contracts provided, deviations from the spec, open requests, test commands run and their results.
14. **R14 frozen files.** A file with no owner in the current wave is frozen. Needed edits go through R7.

### 0.2 Work already in flight or done (not re-planned)

These packages already own files. A planned package that owns one of their files depends on the entry unless the entry is done. Five of them (marked *observed in flight*) were not in the lead's list but were writing files in the working tree at 13:56 UTC. The lead should confirm each one is a running agent. If one is not, spawn it using the entry's notes as its scope.

| key | status | owns | notes |
|---|---|---|---|
| EXT-FONTS | done | src/core/ui.js (FONT, bloodText, TXT_CACHE); assets/fonts/**; css/style.css @font-face block; tools/fonts/**; tools/artifact/blood_nocturne.html (font preload) | Follow-ups are planned in FONTS-FU (W1) and in the owners of the bloodText call sites (§1.16). |
| EXT-APK | done (needs follow-ups) | android/**; tools/apk/**; tools/android/* (keystore, never publish or commit) | Follow-ups: APK-FU (W3) adds the /api proxy, WebView gate, insets and rumble bridges; DELIVER-APK (W4) sets the Netlify origin and rebuilds. |
| EXT-ACCOUNTS | in progress | netlify/functions/**; netlify/lib/**; netlify.toml; src/core/cloud.js; src/scenes/front/account.js; src/scenes/front/cloud_ui.js; src/core/save.js (small hooks); src/scenes/title.js; src/scenes/front/slots.js; src/scenes/menu/tab_system.js; src/scenes/reg_front.js; src/core/input.js (possible one-line guard); tools/accounts/**; docs/ACCOUNTS.md; package.json (test:api) | Packages owning any of these files depend on EXT-ACCOUNTS. |
| EXT-QAFIX | finishing | src/game/world.js; src/game/tilemap.js; src/core/camera.js; src/scenes/overlays.js; src/scenes/dialogue.js; src/scenes/town/hub.js; src/core/game.js; src/scenes/stage.js; src/scenes/front/story.js; src/scenes/town/questboard.js; src/scenes/town/shop.js; src/scenes/town/smith.js; src/data/town.js; src/scenes/front/charselect.js; src/scenes/front/arcade_run.js; src/game/pickups.js | Packages owning any of these files depend on EXT-QAFIX. |
| EXT-ARTBAKEOFF | running (shared task list #17-#28) | src/render/painted/** (kit.js, registry.js, enemy_kit.js); src/render/hero_puppet.js (new); tools/painted/**; tools/puppet/**; assets/puppets/**; assets/painted/**; docs/art/** (BOSS_PIPELINE.md, ENEMY_PIPELINE.md); prototype hooks in src/render/hero.js, src/render/enemies.js, src/game/bosses/a_bonedragon.js and possibly src/game/bosses/index.js or boss.js | Ends with GATE:ART-DECISION. Until then no planned package edits these files: the C/D render and boss-class merges move from SKEL to ART-KIT, and the freeze/telegraph lines in boss.js/a_common.js/b_common.js wait in FEEL-BOSSHOOKS. ART-KIT (W1) takes over src/render/painted/**, src/render/enemies.js and src/game/bosses/index.js; ART-HERO-A (W2) takes over hero.js, hero_parts.js and hero_puppet.js; ART-BOSS-2 takes over a_bonedragon.js. |
| EXT-CUTIN-ART | observed in flight (working tree 13:56 UTC) | assets/cg/cutin_*.webp; tools/kling/cutin_manifest.json; tools/kling/cutin_process.py; tools/kling/cutin_anchors.json | feel.md WP7. If it is not running, spawn it with feel §6.6 as scope. Acceptance: six webp files at most 250 KB each, no watermark (visual review), face/eye anchors in cutin_anchors.json (AWAKEN-CORE copies them into data/awaken.js). |
| EXT-P2-KLING | observed in flight | assets/bg/s14_mirror.webp … s20_void.webp, assets/bg/worldmap2.webp; assets/tex/tex_mirror\|tex_forge\|tex_coral\|tex_sky_marble\|tex_nightmare\|tex_rotwood\|tex_void.webp; assets/portraits/b_narkissa\|b_narkissa2\|b_moloch\|b_dagon\|b_ziz\|b_mara\|b_behemoth\|b_nihil\|b_nihil2\|npc_rook2.webp; assets/cg/cg_rift_sky … cg_p2_true.webp (world2 §13.1 list); tools/kling/manifest_p2.json | world2 WP-H1. Acceptance: world2 §13.1 size budgets (bg at most 180 KB, cg at most 170 KB, portrait at most 90 KB, texture at most 60 KB, Part 2 total at most 6 MB), watermark crop verified. |
| EXT-P2-BLENDER | observed in flight | tools/blender/build_p2.py; assets/icons/<Part 2 ids>.png (whip_7 … amulet_7, wheart_1…6, star_shard, rift_lantern, dawnflower); assets/props/<Part 2 ids>.png (21 deco_* + prop_mirror_switch + prop_spore_pod) | world2 WP-H2. |
| EXT-CMP-ART | observed in flight | assets/portraits/cmp_*.webp; assets/portraits/npc_greta.webp; tools/kling/manifest_companions.json; tools/kling/icon_focus.json | companions C9 (portraits only; the SFX half is AUDIO-CMP). File names keep the producer's names: cmp_m_* and cmp_g_* for Part 1 companions, cmp_mt_*/cmp_gd_* for Part 2. data/companions.js maps each id to its portrait path (no asset renames). |
| EXT-MUSIC-P2 | observed in flight (src/data/music.js +422 lines) | src/data/music.js | world2 WP-I: 11 tracks s14…s20, boss3, boss4, nihil, worldmap2. Acceptance: every id compiles (tools/gallery_audio.html smoke), loudness within ±10% of s13/chaos. |

### 0.3 Gates

| gate | meaning | blocks |
|---|---|---|
| GATE:ART-DECISION | The lead has published the art approach for creatures (bosses, enemies, companions, Part 2 creatures): 'vector_hd' or 'painted'. The hero direction is already signalled (commit 51785f9: painted cut-out puppet) but the lead confirms the details (rig format, runtime file, view set). | ART-KIT and everything that depends on it |
| GATE:QA-DRY | One complete W4 regression round finished with zero S1-S3 defects and no source edit landed after that round started (the loop in §5.3). | every W5 package (DELIVER-WEB, DELIVER-APK, DELIVER-ARTIFACT, DELIVER-HANDOFF, QA-SIGNOFF) |

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
| src/core/touchpad.js | initTouchPad()→null, touchpad = {setVisible(), openEditor(), closeEditor()} | PLAT-TOUCH (W1) |
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
| mount | R | L3 (10) | L3 (10) | 탑승/하차 button (shown only with a mount equipped) |
| guard | G | R3 (11) | R3 (11) | 수호 button (shown only with a guardian equipped) |
| map | Tab, M, I | SELECT (8) | unbound (pause → 인벤토리) | 가방 button (top centre) |
| menu (pause) | Enter, Escape | START (9) | START (9) | Ⅱ button (top centre) |
| confirm / cancel (menus) | Z, Space, Enter / X, Escape, Backspace | S/E by ctrlConfirm ('auto': Nintendo = east confirm) | same | tap / back button |
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
- Minimum circle gap in the touch layout above is 22 px (pairwise, class S); all hit radii = visual + 10 px slop, nearest centre wins.
- Awakening trigger (feel §6.1): when both gauges are full, a tap under 0.20 s fires the normal ult on release, 0.20–0.45 s cancels, ≥ 0.45 s awakens; when not ready, ult fires on press (no latency). 'awaken' fires instantly when ready.
- Double-tap sprint uses input.releasedAt(action) (new, PLAT-INPUT). Command techniques are checked before the sprint dash attack: →→+공격 within the command window (0.6 s; 0.8 s on touch) casts 수룡참 if learned and MP suffices, otherwise the sprint dash attack plays.
- Menus resolve semantics (confirm, cancel, prevTab, nextTab, alt, alt2, swap) from input.bindings per device, not from gameplay action names, so B = dash never also cancels.
- Remappable (Options › 조작): jump, attack, dash, sub, skill1, skill2, swap, ult, awaken, map, mount, guard. Not remappable: menu/START/Escape, movement, menu confirm/cancel.
- Touch technique radial (platform §5.5 P2) is optional and opens by long-press on the swap button, never on attack (attack hold = charge).
- Rumble: every rumble call goes through input.rumble(strong, weak, ms) → haptics (§1.11).

### 1.5 Settings keys (`DEFAULT_SETTINGS`, one owner)

| key | default | values | source | options page | row label |
|---|---|---|---|---|---|
| settingsVersion | 2 | 2 | platform §10 | — | — |
| musicVol | 0.6 | 0..1 | existing | 소리 | 배경 음악 |
| sfxVol | 0.8 | 0..1 | existing | 소리 | 효과음 |
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
| language | 'ko' | 'ko' | existing | — | — |

- Owner: src/core/save.js DEFAULT_SETTINGS + saves.loadSettings() (PLAT-SAVE-ASSETS, W1). All keys land in one edit.
- Migration: no settingsVersion (v1) → quality resets to 'auto' (v1 values came from detectQuality(), not from the player); unknown keys are kept; out-of-range values fall back to defaults; settingsVersion = 2.
- Companions add no settings key: auto-skill lives per save in state.companions.autoSkill (null = device default: on in touch mode). World2 adds none.
- Options pages (PLAT-OPTIONS): 소리 · 화면 · 조작 · 터치 · 기타, rows as in the table, plus 조작 안내 › generated from input.bindings (includes 탈것 [R/L3], 수호신 [G/R3], 각성기 [F 길게 / V · RT 길게]) and the 전체 화면 toggle action on 화면. Each row's ◀▶ targets are ≥ 44 CSS px after UI scale.

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

### 1.7 Hook points and their order

Every hook line carries its tag (rule R4). GAME-HOOKS (W1) inserts all `player.js` lines, and WORLD-CAM (W1) inserts all `world.js` lines, against the W0 stubs. The logic owners then fill the modules those lines call.

**`src/game/player.js`** (inserted by GAME-HOOKS in W1; FEEL-MOVE owns the file in W2 and must keep every tagged line)

| # | location | line (sketch) | tags | logic owner |
|---|---|---|---|---|
| 1 | constructor (end) | initFeel?.(this); this.mount = null; this.superArmor = 0; this.awakenHoldK = 0; this.lastDashEnd = -9; | feel, cmp, awaken | FEEL-MOVE, CMP-MOUNT, AWAKEN-CORE |
| 2 | update(): right after tickTimers() | this.mount?.tick(dt, world, this, inp); | cmp | CMP-MOUNT |
| 3 | update(): before horizontal control | const gait = updateGait?.(this, world, dt, inp) ?? null;   // returns null while riding | feel | FEEL-MOVE |
| 4 | update(): dash branch | if (this.mount?.riding) { tryCharge / updateCharge } else { existing dash + dashFx?.(this, world, phase); lastDashEnd on end } | cmp, feel | CMP-MOUNT, FEEL-MOVE |
| 5 | update(): movement numbers | const prof = this.moveProfile(gait);  // riding → mount.profile(this); else {speed: B × gaitMul × (world.gimmick?.speedMul ?? 1), accel, decel, …} | cmp, feel, gimmick | GAME-HOOKS (function), FEEL-MOVE (gait), CMP-MOUNT, GIMMICK-* |
| 6 | update(): crouch | this.crouch = !this.mount?.riding && … | cmp | CMP-MOUNT |
| 7 | handleJump(): first lines | if (this.mount?.riding && this.mount.handleJump(world, this, dt)) return;  then  if (world.gimmick?.onJumpInput?.(this)) return; | cmp, gimmick | CMP-MOUNT, GIMMICK-ENGINE |
| 8 | doJump() / wall jump | onJump?.(this, world, air); | feel | FEEL-MOVE |
| 9 | handleAttackInput(): first line | if (handleUltInput(this, world)) return;   // replaces `if (input.pressed('ult') && this.run.sp >= 100) …` | awaken | AWAKEN-CORE |
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

**`src/render/hero.js`, `drawHero()` order** (ART-HERO-A in W2, ART-HERO-B in W3)

| # | step | rule | owner |
|---|---|---|---|
| 1 | resolve view | opts.yaw defined → view mode (facing ignored, HERO_VIEW steps); else side view (no yaw code runs) | ART-HERO-B (W3) |
| 2 | anim → pose | existing cases + case 'walk'\|'sprint'\|'run_start'\|'skid'\|'pivot'\|'land_heavy': gaitPose(P, K, anim, p, at); holdFor(P, K, GAIT_ANIMS[anim]); 'run' uses p.gaitPh when it is a number | ART-HERO-A (W2), using FEEL-MOVE's hero_gait.js |
| 3 | transition blend | rig.bd = 0.06 for skid/pivot/land_heavy, 0.12 between walk/run/sprint | ART-HERO-A |
| 4 | rider override | when p.ride: force pelvis to (ride.sx, ride.sy), seated legs, lean + ride.lean + 0.6·duck, skip the far leg, ride anims (companions §11.4) | ART-HERO-A |
| 5 | feel overlay | applyFeelOverlay(P, p) (squash, accLean, sprint lean); no-op when p.feel is missing or p.ride is set | ART-HERO-A |
| 6 | solve / rig | IK solve (vector) or puppet bone solve (painted) | ART-HERO-A |
| 7 | view projection | yaw projection with depth-ordered layers, front/back details, cloth in side-local space (platform §7.3) | ART-HERO-B (W3) |
| 8 | draw layers (detail) | detail overhaul; equipment must still change the look (weapon type/style/glow/enhance level, headgear, cape, armor, wings, aura, tier-7 'rift' shimmer) | ART-HERO-A |
| 9 | rim pass | budget-clamped scale; off on low quality | ART-HERO-A |
| opts | contract | drawHero(ctx, p, world, { yaw?, scale?, alpha?, tint?, ghost?, noRim? }): tint/alpha keep working for the reflection enemy and awakening spectral knights (cached ghost bitmaps) | ART-HERO-A/B |

### 1.8 HUD region allocation

Logical pixels. The view is 960 to 1280 wide and 540 tall. "Touch" means `input.mode === 'touch'`.

| region | drawn by | desktop | touch | notes |
|---|---|---|---|---|
| portrait + level badge | hud.js | x 14–80, y 12–78 | same | safeArea 'full': all left anchors + game.safe.l, top anchors + game.safe.t |
| vitals (name, HP, MP, EXP) | hud.js | x 90–320, y 12–62 | same |  |
| hearts, sub-weapon, buffs | hud.js | x 90–380, y 64–90 | same |  |
| skill slots + page hint | hud.js | x 14–102, y 92–150 | y 92–154 | labels via prompts.drawGlyph; hint '[swap] 페이지 n/2' |
| ult (SP) gauge | hud.js | x 106–226, y 100–124 | same |  |
| awakening gauge (tier ≥ 1) | feel_hud.drawAwGauge | x 106–226, y 126–146 | same | label 각성 + 120×6 bar |
| ready text (ult / awakening) | feel_hud.drawAwGauge | x 106–236, y 148–170 (two lines) | same | '필살기 준비!' / '각성 가능! [F 길게]' — glyph per device |
| companion widgets | companion_hud | x 240–372, y 92–158 | same | mount 40 px, guardians 38 px, labels [R]/[G], 탑승/수호, L3/R3 |
| score block | hud.js | x vw−164 – vw−14, y 10–72 | y 10–80 |  |
| combo + style (DNF column) | feel_hud.drawComboHUD | x vw−320 – vw−14, y 90–200 | no boss: y 90–200; boss bar visible: y 194–300 |  |
| top-centre stack: gimmick meters → toasts | gimmicks.drawScreen, game toast renderer | centre ±120, starts y 12; meters 20 px/row; toasts 26 px/row (max 3 during stages) | starts y 74 (below the Ⅱ and 가방 buttons) | hudLayout().stack(n) gives the next free row; StageScene.toastY reads it |
| announcer | feel_hud.drawAnnouncer | centre (vw/2, max(stackBottom + 30, 0.30·vh)), width ≤ 560 | no boss: centre y ≥ 150; boss bar visible: centre (vw/2, 184), width ≤ 360 | suppressed while world.banner is shown; queue 2 |
| boss bar | hud.js | x (vw−w)/2, w = min(640, vw−260), y vh−62 – vh−26 | w = min(560, vw−320), y 140–186 |  |
| call-out lane (guardian skill cards) | companion_hud | x 14–314, y 172–224 | x 14–314, y 244–296 |  |
| banner (stage title, STAGE CLEAR, falseDawn) | hud.js | centre, y 0.30–0.36·vh | same | hides the announcer |
| touch pad | touchpad.js (DOM overlay) | — | bottom corners; HUD keeps no persistent widget in the bottom 45% on touch |  |
| world-space text (callouts, hold ring, dmg numbers) | impact.js / awaken.js | near targets | same | not HUD |

- src/render/hud_layout.js (HUD-LAYOUT, W1) exports hudLayout(world, vw, vh) → named rects plus stack(i) and toast anchor; every HUD drawer and gimmicks.drawScreen read it. The pixel positions in feel §4.10, companions §7.1 and world2 §0 are superseded by this table.
- world.hudHidden (awakening cut-in and director) hides the whole HUD, including companion widgets and gimmick meters (drawScreen checks it).
- Acceptance (tools/test_hud_layout.mjs, HUD-LAYOUT in W1 and HUD-FINAL in W3): no two rects overlap at 960×540 and 1280×540, desktop and touch, with and without boss bar, 0–2 meters, 3 toasts, tier ≥ 1 gauge, 3 companion widgets, and safeArea 'full' with insets 47/47/0/21.

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
| platform §6.1 safe areas | game.safe {l,r,t,b} from platform.js (env() probe ⊕ window.__BN_INSETS); safeArea 'fit' lays the canvas inside the safe rect |
| platform §6.2 UI scale | game.cssScale, uiK/uiW/uiH; scenes with uiScale = true render inside ctx.scale(uiK) with input.setPointerTransform; ui text floor on (ui.setTextFloor) while such a scene renders |
| platform §6.4 budget + governor | dpr = min(devicePixelRatio, cap, sqrt(budget/(cssW·cssH))); symmetric quality governor for 'auto' on all devices (replaces autoQuality) |
| platform §6.5 pacing | fpsCap 60: render() only when ≥ 1 tick ran this rAF or game.dirty; input.pollFrame() once per rAF |
| platform P-18 pad | game.syncPad() stays the only visibility owner: touchpad.setVisible(input.mode === 'touch' && !portraitLocked && scene shows pad); legacy helpers become shims that set scene flags |
| platform P-26 | pop() on the last scene → go('title') |
| platform §6.6/§6.7/§9.3 | wake lock, cursor hide, boot progress hand-off, boot error screen, platform.onUpdateReady(cb) for the title |
| feel §4.9 flash policy | flash(color, strength, decay): strength × settings.flashFx, cap 0.7, more than 2 flashes above 0.3 within 1 s → later ones capped at 0.3 |
| feel §4.9 vignette | new game.vignette(color, a, decay): edge vignette state drawn after the flash in render() |
| toasts (QA-fix + this plan) | keep toastX/toastY/toastUp and the 'menu' check; skip toasts while the top scene has deferToasts or hideToasts (awakenCutin, ultCutin, companionJoin, story); StageScene.toastY comes from hudLayout (§1.8); at most 3 visible in stages; safe-area offsets |
| fonts follow-up | main.js awaits ui.fontsReady before game.start (PLAT-CORE owns main.js) |

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
- Scene flags understood by game.js: opaque, hidePad, showPad, deferToasts, hideToasts, uiScale, toastX/toastY/toastUp, autoPause().

### 1.14 Gameplay interplay rules

- Awakening and ultimates dismount first: castUltimate and castAwakening call p.mount?.beforeCast(world, p, 'ult'); auto-remount 1.4 s after the director ends if on ground and findMountSpot succeeds.
- Guardian resonance (bond ≥ 3) triggers on ultimateCast and awakenCast and fires when world.cutscene returns to false (guardians never target during cutscenes).
- world.freezeEnemies is honored by Enemy, Boss (boss.js), BossA (a_common.js), BossB (b_common.js) (FEEL-REACT, W1) and by c_common.js-based Part 2 bosses (BOSS-P2-*). Gimmicks pause their progress while world.cutscene.
- Boss damage cap for one awakening: 30% of boss max HP (feel §6.1), through attack.capFn read in impact.preImpact.
- b_nihil 'final' transition: world.run.sp = 100 and, when the hero's class tier ≥ 1, world.run.aw = 100 (the finale is the awakening moment); buffs.holyaura 20; voidwall open.
- Style: companion hits count ×0.5; AW gain is 0 for ult/awaken/companion tags; SP gain ×0.4 for guardian hits (companions §5).
- noMount: no boss sets it by default; W4 QA may set it per boss in data/bosses_*.js (FIX-DATA).
- Hitstop: guardian auto hits use hitstop 0 (mandatory), assists 0.03; the rolling cap (0.40 s per 1 s) applies to all non-S/A hits.

### 1.15 Art approach (TBD) and the art work split

| area | approach | packages / scope | must keep / contract |
|---|---|---|---|
| hero | TBD by the lead (signal: commit 51785f9 '영웅 그래픽 방향 확정: 채색 컷아웃 퍼핏' — painted cut-out puppet; pipeline in tools/puppet/{ingest.py, lib/pup.py, rigs/, src/kael/*}; runtime planned as src/render/hero_puppet.js) | ART-HERO-A (W2: detail, gait/feel hooks, rider pose, equipment visuals), ART-HERO-B (W3: view angles for the turntable, HERO_VIEW) | class change changes the look; equipment changes the look; drawHero opts contract; low-quality path; ≤ 1.5× side-view cost for yaw views |
| creatures | TBD by the lead — 'vector_hd' (HD procedural vector) or 'painted' (Kling cut-out puppets via src/render/painted/kit.js, bake-off prototype) | 13 existing bosses (ART-BOSS-1…5), 67 existing enemies (ART-ENEMY-1…4), and the same approach for Part 2 enemies/bosses and companion renderers | renderer signatures unchanged (ENEMY_RENDER[id](ctx, e, world, {flash}); boss draw(ctx, world)/paint); origin feet-centre; facing by caller; flash overlay; elite tint by caller; anim from e.anim/e.animT; no Math.random or fx.emit in draw code (painted kit rule); procedural fallback when an image is missing; per-draw cost ≤ 1.5× today's renderer (gallery perf loop); painted memory ≤ 15 MB per boss desktop / 6 MB phone |

**Enemy renderer split (after ART-ENEMY-SPLIT)**

| package | file | enemies |
|---|---|---|
| ART-ENEMY-1 | src/render/enemies_a.js | common + s01–s03 (19): mimic golden_bat bat zombie skeleton crow wolf possessed ghost wisp bone_thrower gravedigger mud_man armor_knight axe_armor gargoyle medusa_head medusa_spawner skeleton_archer |
| ART-ENEMY-2 | src/render/enemies_a2.js | s04–s06 (15): blood_skeleton phantom_sword lesser_demon spear_guard puppet_maiden bone_pillar mummy skeleton_knight corpse_worm bone_scimitar book_fiend flea_man skeleton_mage scholar_ghost ectoplasm |
| ART-ENEMY-3 | src/render/enemies_b.js | s07–s09 (14) + PROJ_B/ZONE_B: slime homunculus flesh_golem plague_doctor acid_turret merman killer_fish frog_demon drowned water_spirit gear_golem harpy clockwork_soldier cog_wheel |
| ART-ENEMY-4 | src/render/enemies_b2.js | s10–s13 (19): ice_golem frost_wraith snow_wolf frozen_knight ice_bat succubus blood_priest bone_angel death_knight cursed_nun vampire_bride demon_lord bat_swarm royal_guard chaos_spawn hellhound abyss_eye shadow_hunter void_demon |

**Boss split (drawing only)**

| package | files | bosses |
|---|---|---|
| ART-BOSS-1 | a_nightwing.js, a_banshee.js, a_dullahan.js | b_nightwing, b_banshee, b_dullahan |
| ART-BOSS-2 | a_crimson.js, a_bonedragon.js, a_grimoire.js | b_crimson, b_bonedragon, b_grimoire |
| ART-BOSS-3 | a_chimera.js, b_leviathan.js, b_colossus.js | b_chimera, b_leviathan, b_colossus |
| ART-BOSS-4 | b_frostqueen.js, b_death.js | b_frostqueen, b_death |
| ART-BOSS-5 | b_dracula.js, b_chaos.js | b_dracula (both forms), b_chaos |

- ART-BOSS packages change drawing code only (no pattern, timing, hitbox or hit-part changes). Shared helpers go into the ART-KIT module, never into a_common.js/b_common.js.
- ART-ENEMY-SPLIT (W1) is mechanical: it moves renderers so each ART-ENEMY package owns one file; shared helpers move to src/render/enemies_shared.js (not 'enemy_kit', which is the painted runtime's name); exports RENDER_A, RENDER_B, PROJ_B, ZONE_B keep their names (RENDER_A = {...A1, ...RENDER_A2}, RENDER_B = {...B1, ...RENDER_B2}); gallery screenshots must be pixel-identical before and after.
- Painted approach: each ART package owns its asset dirs (assets/painted/<id>/**, tools/painted/<id>/**) and its Kling manifest; Kling credit budget per package is set by the lead (open item).

### 1.16 Front-scene edits (fonts follow-ups, accounts, platform)

The bloodText call sites from the fonts follow-ups (title logo, HUD stage card, boss intro/WARNING/GAME OVER, results, arcade result, THE END, NEW RECORD, JACKPOT) go to whoever owns each file in the wave that touches it.

| file | owner | edits |
|---|---|---|
| src/scenes/title.js | PLAT-FRONT (W2) | bloodText logo; update-ready prompt (platform.onUpdateReady); pad audio-unlock hint; iOS add-to-home card; '안드로이드 앱(APK) 받기' (web + Android UA); keep the accounts entry (EXT-ACCOUNTS); uiScale; glyph footer |
| src/scenes/front/common.js | PLAT-FRONT | footer/hint via prompts.legacyKey; backButton/gbutton ≥ 44 CSS px; setPad → scene flags |
| src/scenes/front/slots.js | PLAT-FRONT | drawSlot hasOwn guard (B103 pending); cloud badges from accounts; chapter up to 20 with a Part 2 marker |
| src/scenes/front/account.js, cloud_ui.js | PLAT-FRONT (after EXT-ACCOUNTS) | uiScale, glyph hints, 44 px targets; P-29 pad message for code entry |
| src/scenes/front/highscore.js | PLAT-FRONT | bloodText 'NEW RECORD' |
| src/scenes/front/arcade.js | PLAT-FRONT | world2 §11: BOSS_ORDER + 7, COURSES 이계편/전 보스 연속, LEVEL_PRESETS 이계의 순례자, wtier ≤ 7, p2Known; presets use baseIdFor (integration note) |
| src/scenes/front/arcade_run.js | PLAT-FRONT | bloodText result/rank; survival hard mode wires the arena 'pit' room; Math.min(7, P.wtier) |
| src/scenes/front/charselect.js, difficulty.js, dialogs.js | PLAT-FRONT | uiScale, glyphs, tap sizes (turntable preview on charselect optional) |
| src/scenes/front/options.js (+ options_controls.js) | PLAT-OPTIONS (W2) | §1.5 pages, remap screens, guides from bindings |
| src/scenes/front/story.js | STORY-P2-A (W2) | {cmd:'recruit'} (world2 §2.4); uiScale; keep name/portrait override |
| src/scenes/front/ending.js | STORY-P2-A (W2) | world2 §2.2/§2.3 (ENDINGS p2/p2true, decideEnding, credits slides/stats/notes, p2_prologue after true credits, leave → hub for p2 kinds); bloodText 'THE END' |
| src/scenes/overlays.js | OVERLAYS (W2) | bloodText boss intro/WARNING/GAME OVER; UltCutinScene upgrade; pause/gameover hub {from: w.stage.id} |
| src/scenes/results.js | PLAT-GAMES (W2) | bloodText STAGE CLEAR/rank; toEnding includes s20 |
| src/scenes/games/slot.js | PLAT-GAMES (W2) | bloodText JACKPOT |
| src/render/hud.js | HUD-LAYOUT (W1) | bloodText stage title card |
| src/main.js | PLAT-CORE (W1) | await fontsReady before start |

### 1.17 Story and data append points

| file / point | owner | content |
|---|---|---|
| src/data/enemies.js | SKEL (W0) | export const ENEMIES = { ...ENEMIES_A, ...ENEMIES_B, ...ENEMIES_C, ...ENEMIES_D }; |
| src/game/ai.js | SKEL (W0) | Object.assign(AI, AI_A, AI_B, AI_C, AI_D); |
| src/render/enemies.js | ART-KIT (W1, after the bake-off) | ENEMY_RENDER = { ...RENDER_A, ...RENDER_B, ...RENDER_C, ...RENDER_D } (plus the painted draw hook if 'painted' wins) |
| src/data/bosses.js | SKEL (W0) | BOSSES = { ...BOSSES_A, ...BOSSES_B, ...BOSSES_C, ...BOSSES_D } |
| src/game/bosses/index.js | ART-KIT (W1, after the bake-off) | BOSS_CLASSES = { ...BOSS_A, ...BOSS_B, ...BOSS_C, ...BOSS_D } (plus painted preload if 'painted' wins) |
| src/data/story.js (end of file) | SKEL (W0) | import { SCRIPTS_P2 } from './story_p2.js'; import { COMPANION_SCRIPTS } from './story_companions.js'; Object.assign(SCRIPTS, COMPANION_SCRIPTS, SCRIPTS_P2); (CREDITS_P2 is imported by creditsFor, STORY-P2-A) |
| src/data/story_p2.js | STORY-P2-A | SCRIPTS_P2 = { ...local, ...SCRIPTS_P2B } (story_p2b.js is STORY-P2-B's) |
| src/data/stages.js imports | SKEL adds 3 anchors after `import { ROOMS as ARENA } from './maps/arena.js';` | // ── P2 map imports s14–s16 (MAPS-P2-A) ── / s17–s18 (MAPS-P2-B) ── / s19–s20 (MAPS-P2-C) ── |
| src/data/stages.js STAGES | SKEL adds 3 anchors before `  arena: S({` | // ── P2 stages s14–s16 (MAPS-P2-A) ── / s17–s18 (MAPS-P2-B) ── / s19–s20 (MAPS-P2-C) ──; each maps package inserts directly after its own anchor |
| src/data/stages.js exports | SKEL (W0) | STAGE_ORDER_P1 (today's list), STAGE_ORDER_P2 = ['s14'…'s20'].filter((id) => STAGES[id]), STAGE_ORDER = [...P1, ...P2], SHARDS, HEARTS (RELICS kept) |
| src/game/skills.js | SKEL (W0) | import { SKILL_IMPL_P2, TECH_NAMES_P2 } from './skills_p2.js'; Object.assign(SKILL_IMPL, SKILL_IMPL_P2) right after SKILL_IMPL; Object.assign(TECH_NAMES, TECH_NAMES_P2); castUltimate: p.mount?.beforeCast?.(world, p, 'ult') + bus.emit('ultimateCast', …) before world.startUltimate; castSkill/castTechnique: p.mount?.beforeCast?.(world, p, id) |
| src/scenes/index.js | SKEL (W0) | register 'awakenCutin' and 'companionJoin' |
| src/scenes/reg_town.js | SKEL (W0) | register 'stable' |
| src/core/events.js | SKEL (W0) | registry comment lists every bus event in §1.12 |
| src/data/quests.js | ITEMS-P2 (W2) | LV to 20 chapters, MAIN s14–s20, 13 Part 2 side quests, and the Greta quests cq_hati/cq_skoll before QUEST_ORDER |
| src/data/items.js | P2-DATA (W1), ITEMS-P2 (W2) | TIER_LV/T_ATK/A_BASE/prices tier 7, rows 13–14 per table, ACC_TABLE, MATERIALS, KEYS (worldHeart/starShard/color), UNIQUE_LIST, mythics; MYTHIC_WEAPONS stays tier-6 only, MYTHIC_WEAPONS_P2 new |
| src/data/lore.js | P2-DATA (W1) | d21–d27 (d21 cmd per §1.21), l21–l34, LORE_ORDER and DOC_ORDER appended |
| src/data/npcs.js | CMP-TOWN (W2) | npc_greta + NPC_ORDER |
| src/data/town.js | CMP-TOWN (W2) | W = 96, stable door 89 'D', Greta 93 'N', BUILDINGS/TOWN_LAMPS/TOWN_PROPS/TOWN_NPCS/TOWN_TALK entries |
| src/data/music.js | EXT-MUSIC-P2 | 11 tracks (world2 §12) |

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
| web build | tools/deploy/build_web.mjs copies an allowlist into dist/web (index.html, build-info.js, manifest.webmanifest, sw.js, css/, src/, assets/ incl. assets/lo/ and assets/fonts/, robots.txt, downloads/); fatal deny check for tools\|docs\|android\|node_modules\|netlify\|dist\|.git and *.keystore\|*.jks\|*.p12\|*.properties\|.env; files > 25 MB fail. The canonical output dir is dist/web (platform §9.1; the integration note's 'dist-web' is the same thing). |
| netlify.toml | [build] command = 'node tools/deploy/build_web.mjs', publish = 'dist/web'; [build.environment] NODE_VERSION = '22'; [functions] directory = 'netlify/functions'; headers per platform §9.2 with CSP script-src 'self' (no inline scripts after PLAT-CORE), style-src 'self' 'unsafe-inline', font-src 'self', connect-src 'self', img-src 'self' data: blob:; Permissions-Policy adds gamepad, fullscreen, screen-wake-lock, autoplay; keep accounts' COOP and /api/* no-store; _redirects /apk and /download → /downloads/BloodNocturne.apk 302. Never deploy with --dir . |
| service worker | versioned precache (bn-<buildHash>), cache-first src/css/fonts, bn-assets-v1 LRU 250 for assets, network-first navigations with a 3 s timeout; never touches /api/, /downloads/, build.json, non-GET or cross-origin; SKIP_WAITING only on request; registered on localhost unless ?nosw |
| APK | WEB_FILES = dist/web minus sw.js and downloads/; AssetServer proxies https://appassets.androidplatform.net/api/* to the Netlify origin read at build time from tools/apk/api_origin.txt (headers and body unchanged, no cache, 15 s timeout → JSON error); WebView ≥ 98 gate; __BN_INSETS bridge + 'bn-insets' event; optional BNAndroid.rumble; MIME table covers every file type in dist/web; ≤ 20 MB; only INTERNET and VIBRATE permissions |
| artifact | tools/artifact/blood_nocturne.html republished with assets/fonts/*.woff2 and OFL.txt in its files map; accounts are hidden there (CSP blocks /api) and saves stay local; the service worker is not registered in the artifact |
| keystore | tools/android/release.keystore and keystore.properties are git-ignored, never published and never committed; handed to the user privately at the end (DELIVER-HANDOFF) with backup instructions in docs/RELEASE.md (no password in docs) |

### 1.21 Command techniques (d21 fix)

- d21 비전서: 경영참 (tech_mirror): cmd ['d','uf','btn:attack'] (↓↗+공격) instead of ['b','b','btn:attack'] — not a subsequence of any existing command and contains none; ↗ keeps the hero facing forward.
- d23 와류참 [u,u] and d26 정화의 불꽃 [u,f] stay as in world2.
- W4 QA adds a check that every command technique d02…d26 fires by keyboard, by pad stick sectors and by touch (8-way sectors, 0.8 s window), including commands that end in a back direction (d05 선풍각 ↓↙←), which may be affected by the same facing flip.

---

## 2. Wave overview

| wave | goal | packages | keys |
|---|---|---|---|
| W0 | Skeleton gate (runs now, alongside the in-flight agents) | 1 | SKEL |
| W1 | Foundation: engines, hooks, APIs, data ids, platform core | 20 | PLAT-INPUT, PLAT-TOUCH, PLAT-CORE, PLAT-SAVE-ASSETS, PLAT-QA, FONTS-FU, HUD-LAYOUT, AUDIO-FEEL, FEEL-IMPACT, FEEL-REACT, FEEL-BOSSHOOKS, WORLD-CAM, GAME-HOOKS, GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA, CMP-DATA, ART-ENEMY-SPLIT, ART-KIT |
| W2 | Features, content and art | 50 | FEEL-MOVE, FEEL-HUD, FX-ULTKIT, FX-ULTS, OVERLAYS, AWAKEN-CORE, AWAKEN-DIR-A, AWAKEN-DIR-B, AUDIO-CMP, CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-ART-A, CMP-MOUNT-ART-B, CMP-GUARD-ART-A, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES, DELIVERY-WEB, MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ART-HERO-A, ART-BOSS-1, ART-BOSS-2, ART-BOSS-3, ART-BOSS-4, ART-BOSS-5, ART-ENEMY-1, ART-ENEMY-2, ART-ENEMY-3, ART-ENEMY-4 |
| W3 | Second pass, harnesses, APK follow-ups, docs | 9 | ART-HERO-B, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH |
| W4 | Final integration and QA: full regression, performance budgets, loop until dry | 2 + 16 fix buckets per round | QA-ROUND, PERF-MOBILE |
| W5 | Delivery (closing step of the final wave, after GATE:QA-DRY) | 5 | DELIVER-WEB, DELIVER-APK, DELIVER-ARTIFACT, DELIVER-HANDOFF, QA-SIGNOFF |

**Critical path.** W0 SKEL → W1 GAME-HOOKS / WORLD-CAM / FEEL-IMPACT → W2 AWAKEN-CORE → AWAKEN-DIR-A/B → W3 FEEL-QA → W4 QA loop → GATE:QA-DRY → W5 DELIVER-WEB → DELIVER-APK → DELIVER-WEB redeploy → QA-SIGNOFF. A second path runs through the art: GATE:ART-DECISION → ART-KIT → ART-HERO-A → ART-HERO-B → turntable acceptance. The Part 2 path is P2-DATA / GIMMICK-* → MAPS-P2-A/B/C and BOSS-P2-1…4 → P2-QA.

**Parallelism.** W1 has 20 packages, so it runs in about two batches of 10. Because waves are soft barriers (R2), a later-wave package whose dependencies are done may fill an idle slot early; STORY-P2-B, for example, needs only SKEL. W2 has 50 packages. Its packages share no files, so the orchestrator can fill all 10 slots continuously. Start the packages with the longest dependency chains first: FX-ULTKIT, FX-ULTS, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, MAPS-P2-*, BOSS-P2-1 and ART-KIT's dependents.

---

## 3. Wave details

Each package lists what it owns exclusively in its wave, any append-only hunks it adds to another package's file, what it depends on, the contracts it provides and consumes, the acceptance commands, and its size. `smoke` commands use `tools/smoke.mjs` (see ARCHITECTURE.md for step tokens; `eval=` runs JavaScript in the page).

### W0 — Skeleton gate (runs now, alongside the in-flight agents)

| key | title | size | depends on |
|---|---|---|---|
| **SKEL** | Skeleton: contract stubs, data/AI/story aggregators, scene registry, stage anchors, skills.js hooks | M | — |

#### SKEL — Skeleton: contract stubs, data/AI/story aggregators, scene registry, stage anchors, skills.js hooks (M)

- **Spec:** MASTER_PLAN §1.3 (stub table), §1.17 (append points); companions §12.1, §12.3 (scenes/index.js, reg_town.js, story.js, events.js, skills.js hook lines); world2 §4.2 exports, §5.1/§6.1 stubs and merges, §8 skills.js merge; feel §9 WP5 (scenes/index.js registration)
- **Owns:** `src/data/feel_move.js`, `src/game/feel_move.js`, `src/render/hero_gait.js`, `src/game/style.js`, `src/data/feel_hit.js`, `src/render/hitfx.js`, `src/render/feel_hud.js`, `src/render/ultfx.js`, `src/game/awaken.js`, `src/game/awaken_directors.js`, `src/game/awaken_directors_b.js`, `src/data/awaken.js`, `src/scenes/awaken_cutin.js`, `src/core/prompts.js`, `src/core/touchpad.js`, `src/render/hud_layout.js`, `src/game/gimmicks.js`, `src/game/gimmicks_b.js`, `src/data/enemies_c.js`, `src/data/enemies_d.js`, `src/game/ai_c.js`, `src/game/ai_d.js`, `src/render/enemies_c.js`, `src/render/enemies_d.js`, `src/data/bosses_c.js`, `src/data/bosses_d.js`, `src/game/bosses/c_narkissa.js`, `src/game/bosses/c_moloch.js`, `src/game/bosses/c_dagon.js`, `src/game/bosses/c_ziz.js`, `src/game/bosses/d_mara.js`, `src/game/bosses/d_behemoth.js`, `src/game/bosses/d_nihil.js`, `src/data/story_p2.js`, `src/data/story_p2b.js`, `src/game/skills_p2.js`, `src/data/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `src/game/companions.js`, `src/game/guardian_ai_b.js`, `src/game/mount.js`, `src/render/mount_rig.js`, `src/render/mounts.js`, `src/render/mounts_b.js`, `src/render/guardians.js`, `src/render/guardians_b.js`, `src/render/companion_hud.js`, `src/scenes/menu/tab_companions.js`, `src/scenes/companion_join.js`, `src/scenes/town/stable.js`, `src/data/story_companions.js`, `src/core/audio_companions.js`, `src/game/bosses/bosses_c.js`, `src/game/bosses/bosses_d.js`, `src/data/enemies.js`, `src/game/ai.js`, `src/data/bosses.js`, `src/data/story.js`, `src/data/stages.js`, `src/scenes/index.js`, `src/scenes/reg_town.js`, `src/core/events.js`, `src/game/skills.js`
- **Depends on:** nothing
- **Provides:** every module in §1.3 exists with its contracted exports (no-op, legacy behavior preserved); ENEMIES/AI/BOSSES/SCRIPTS merge the C/D/P2/companion modules; BOSS_C/BOSS_D registries (final) that skip null classes; STAGE_ORDER_P1, STAGE_ORDER_P2 (filtered), STAGE_ORDER, SHARDS, HEARTS; six anchor comments in stages.js; scene names awakenCutin, companionJoin, stable registered; skills.js: SKILL_IMPL_P2 + TECH_NAMES_P2 merges, p.mount?.beforeCast hooks, bus ultimateCast; events.js registry comment (§1.12)
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
| **PLAT-INPUT** | Input core: device modes, bindings/presets, sticks and triggers, hot-plug, prompts/glyphs, haptics | L | SKEL, EXT-ACCOUNTS |
| **PLAT-TOUCH** | Canvas virtual pad: floating stick, slide/roll, skill/ult/companion buttons, layout editor | L | SKEL |
| **PLAT-CORE** | Platform core: safe area, UI scale, pixel budget, pacing, sole pad visibility, flash/vignette/toast policy, boot, main.js | L | SKEL, EXT-QAFIX, EXT-ACCOUNTS |
| **PLAT-SAVE-ASSETS** | Settings schema v2 with migration, lo/ asset variants and decoded-image LRU | M | SKEL, EXT-ACCOUNTS |
| **PLAT-QA** | Platform QA harness (promote the audit prototypes) | M | SKEL, EXT-ACCOUNTS |
| **FONTS-FU** | Fonts follow-ups: brush and damage faces, fontEpoch, taps registry, text floor, coverage gate | M | SKEL |
| **HUD-LAYOUT** | HUD region allocation and hud.js hooks | M | SKEL |
| **AUDIO-FEEL** | Feel SFX set and audio.js registry API | M | SKEL |
| **FEEL-IMPACT** | Hit feel core: impact(), strength classes, hitstop cap, style meter, damage routing, class perks, multi-part hits | L | SKEL |
| **FEEL-REACT** | Enemy reactions (weights, juggle, knockdown/OTG, bounces, stagger), particle presets/shapes, hit sprite caches | L | SKEL |
| **FEEL-BOSSHOOKS** | Bosses honor freezeEnemies and expose boss.telegraph | S | SKEL, EXT-ARTBAKEOFF |
| **WORLD-CAM** | world.js hook points for all features + camera API | L | SKEL, EXT-QAFIX |
| **GAME-HOOKS** | player.js hook lines in canonical order, moveProfile, stats aura hook, save schema v2 + migration | L | SKEL |
| **GIMMICK-ENGINE** | Gimmick framework + mirror, magma, deep, wind; phase tiles; door marks; statue cleanse | L | SKEL, EXT-QAFIX |
| **GIMMICK-KINDS-B** | Gimmick kinds heartbeat, blight, voidwall and the SporePod prop | M | SKEL |
| **GIMMICK-RENDER** | Part 2 themes, weathers, tile styles, decor sets, liquid rendering and the map validator | M | SKEL |
| **P2-DATA** | Part 2 data ids first: enemies, bosses, items (tier 7), docs and lore | L | SKEL |
| **CMP-DATA** | Companion roster data, state API, migration, bus wiring, recruit API | L | SKEL |
| **ART-ENEMY-SPLIT** | Mechanical split of the two enemy render files into four | M | SKEL, EXT-ARTBAKEOFF |
| **ART-KIT** | Shared art kit for the chosen approach (TBD) + render/boss registries | M | GATE:ART-DECISION, SKEL |

#### PLAT-INPUT — Input core: device modes, bindings/presets, sticks and triggers, hot-plug, prompts/glyphs, haptics (L)

- **Spec:** platform §3, §4.1–4.7, §5.5 P1, §11 WP-1; feel §2.1 (analogX, analogMag, rumble), §4.12; companions §6 (mount/guard actions); MASTER_PLAN §1.4, §1.11
- **Owns:** `src/core/input.js`, `src/core/prompts.js`, `src/core/haptics.js`, `src/data/controls.js`
- **Depends on:** SKEL, EXT-ACCOUNTS
- **Provides:** input.mode / onMode / padInfo / stickL / stickR / bindings / touch / setPointerTransform / pollFrame; input.touchMode read-only alias; input.analogX, analogMag, sprintHint, releasedAt(action); input.rumble(strong, weak, ms) → haptics; actions awaken, mount, guard, viewL, viewR, viewReset; map += KeyI; arcade/classic presets, ctrlConfirm, radial deadzone + 8-way sectors, trigger 0.5/0.35, hat decoding; hot-plug toasts + autoPause + bus inputDevice; prompts.bindingOf/drawGlyph/drawHints/legacyKey; haptics.play/rumble/reset (bus subscriptions per §1.11); input.command sector codes, 0.8 s window in touch mode
- **Consumes:** settings ctrl*/touch* (PLAT-SAVE-ASSETS); touchpad.initTouchPad (PLAT-TOUCH; dynamic import with legacy fallback); game.toast/autoPause
- **Notes:** Keep every existing KEYMAP/PADMAP binding reachable in the classic preset. V becomes 'awaken' (falls back to ult). Menus resolve semantics per device from input.bindings.
- **Tests:**
  ```
  node tools/qa/platform_pad.mjs
  node tools/integration.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s03" --out /tmp/claude-0/proto/PLAT-INPUT --steps "wait:3,right:1,jump:0.2,attack:0.2,dash:0.1,swap:0.1,shot"
  ```

#### PLAT-TOUCH — Canvas virtual pad: floating stick, slide/roll, skill/ult/companion buttons, layout editor (L)

- **Spec:** platform §5.1–5.5, §11 WP-2; companions §6 (탑승/수호 as canvas buttons); feel §3.1 (touch sprint ring), §6.1 (ult hold ring); MASTER_PLAN §1.4 touch layout
- **Owns:** `src/core/touchpad.js`, `css/touchpad.css`
- **Depends on:** SKEL
- **Provides:** initTouchPad(input), touchpad.setVisible(bool), openEditor/closeEditor; #tpad event layer + #tpadcv overlay canvas (≤ 30 Hz redraw); buttons per §1.4 incl. mount/guard (auto-shown from world.companions.hudInfo()) and ult hold ring (world.awakenState); floating stick → input.touch.axis + sprintHint (≥ 1.15 R, re-anchor at 1.4 R); settings.touchLayout persistence, tablet band layout, left-handed mirror
- **Consumes:** input.touch API (PLAT-INPUT); world.player skill data (read-only); world.companions?.hudInfo?.() (CMP-SYS); world.awakenState (AWAKEN-CORE); game.safe (PLAT-CORE)
- **Notes:** Removes the legacy #touch DOM at init; visibility only through setVisible(), which game.syncPad calls.
- **Tests:**
  ```
  node tools/qa/platform_touch.mjs
  node tools/integration.mjs --mobile
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s01" --out /tmp/claude-0/proto/PLAT-TOUCH --steps "wait:2,right:1,attack:0.2,jump:0.2,shot" --mobile
  ```

#### PLAT-CORE — Platform core: safe area, UI scale, pixel budget, pacing, sole pad visibility, flash/vignette/toast policy, boot, main.js (L)

- **Spec:** platform §6.1–6.6, §6.7 boot progress, §9.3 SW registration + update hooks, P-18/P-21…P-27/P-30/P-35, §11 WP-3; feel §4.9 flash policy + vignette; companions §12.3 main.js hooks; integration notes: favicon link, toasts over menus, main.js await fontsReady; MASTER_PLAN §1.8 toast anchor, §1.10
- **Owns:** `src/core/game.js`, `src/core/platform.js`, `src/boot-gate.js`, `src/main.js`, `src/scenes/stage.js`, `index.html`, `css/style.css`, `manifest.webmanifest`, `assets/ui/**`, `tools/assets/make_ui_icons.py`
- **Depends on:** SKEL, EXT-QAFIX, EXT-ACCOUNTS
- **Provides:** game.safe, cssScale, uiK/uiW/uiH, scene.uiScale rendering + pointer transform + ui text floor; game.dirty, fpsCap render skipping, pixel budget, symmetric quality governor; game.syncPad as the only pad visibility owner (shims for legacy helpers); game.flash policy (cap 0.7, flashFx, rate limit), game.vignette(); toast policy + StageScene.toastY from hudLayout; pop() guard → title; platform.onUpdateReady, wake lock, cursor hide, boot progress/error, boot gate; input.pollFrame() per rAF; stage.js: map → push('menu', {tab:'inventory'}); main.js: await fontsReady, initCompanions(game), applyCompanionDebug; favicon + iOS meta + maskable icons
- **Consumes:** input (PLAT-INPUT); touchpad (PLAT-TOUCH); hudLayout (HUD-LAYOUT); ui.setTextFloor (FONTS-FU); companion_events (CMP-DATA)
- **Notes:** Rebase on the QA-fix toastX/toastUp change and the accounts hooks; keep the existing game.syncPad name. The inline scripts in index.html move to platform.js so the CSP can drop 'unsafe-inline' for scripts. Do not touch the @font-face block in style.css.
- **Tests:**
  ```
  node tools/qa/platform_view.mjs
  node tools/integration.mjs
  node tools/integration.mjs --mobile
  ```

#### PLAT-SAVE-ASSETS — Settings schema v2 with migration, lo/ asset variants and decoded-image LRU (M)

- **Spec:** platform §10, §6.4 (quality 'auto'), §6.7 (lo/ selection, LRU), P-13, P-25; feel §7; MASTER_PLAN §1.5
- **Owns:** `src/core/save.js`, `src/core/assets.js`, `tools/test_settings_v2.mjs`
- **Depends on:** SKEL, EXT-ACCOUNTS
- **Provides:** DEFAULT_SETTINGS with every key in §1.5; settingsVersion 2 migration in saves.loadSettings(); assets.url() picks assets/lo/ per §6.4 and falls back on error; decoded-bytes LRU (160 MB touch / 400 MB desktop); assets.has(key)
- **Consumes:** game.settings consumers
- **Notes:** Keep the accounts' hooks in save.js intact (EXT-ACCOUNTS).
- **Tests:**
  ```
  node tools/test_settings_v2.mjs
  node tools/integration.mjs
  ```

#### PLAT-QA — Platform QA harness (promote the audit prototypes) (M)

- **Spec:** platform §11 WP-10, §12
- **Owns:** `tools/qa/**`, `package.json`
- **Depends on:** SKEL, EXT-ACCOUNTS
- **Provides:** tools/qa/lib/{server,viewports,fakepad,touch,taps,safearea,net}.mjs; tools/qa/platform_pad|touch|view|menu|load|pwa.mjs; tools/qa/run_platform.mjs; npm scripts qa:platform (package.json)
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
- **Owns:** `src/render/hud.js`, `src/render/hud_layout.js`, `tools/test_hud_layout.mjs`
- **Depends on:** SKEL
- **Provides:** hudLayout(world, vw, vh) → named rects, stack(i), toast anchor, meter rows, call-out lane; hud.js: early return on world.hudHidden; calls drawComboHUD/drawAnnouncer/drawAwGauge (legacy combo block kept while they return false) and drawCompanionHUD; skill labels via prompts.drawGlyph, page hint '[swap] 페이지 n/2'; bloodText stage card; safe-area margins for safeArea 'full'
- **Consumes:** prompts (PLAT-INPUT); game.safe (PLAT-CORE); feel_hud (FEEL-HUD); companion_hud (CMP-UI)
- **Tests:**
  ```
  node tools/test_hud_layout.mjs
  node tools/integration.mjs --only s04,s04_boss
  node tools/integration.mjs --mobile --only s04,s04_boss
  ```

#### AUDIO-FEEL — Feel SFX set and audio.js registry API (M)

- **Spec:** feel §4.11, §9 WP6; companions §10 (defineSfx, SFX_KIT); MASTER_PLAN §1.9
- **Owns:** `src/core/audio.js`, `src/core/sfx_feel.js`, `tools/test_sfx.mjs`
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
- **Owns:** `src/game/impact.js`, `src/game/style.js`, `src/data/feel_hit.js`, `src/game/combat.js`
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

#### FEEL-BOSSHOOKS — Bosses honor freezeEnemies and expose boss.telegraph (S)

- **Spec:** feel §2.1 (bosses row), §4.6 (telegraph counters); MASTER_PLAN §1.14
- **Owns:** `src/game/bosses/boss.js`, `src/game/bosses/a_common.js`, `src/game/bosses/b_common.js`
- **Depends on:** SKEL, EXT-ARTBAKEOFF
- **Provides:** Boss/BossA/BossB skip AI and their own attack timers while world.freezeEnemies (like timeStop, without the grey overlay); boss.telegraph = true during warn/windup helpers
- **Consumes:** world.freezeEnemies (WORLD-CAM)
- **Notes:** Only these one-line hooks; no drawing changes.
- **Tests:**
  ```
  node tools/integration.mjs --only s01_boss,s07_boss,s12_boss
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&room=boss" --out /tmp/claude-0/proto/FEEL-BOSSHOOKS --steps "wait:2.5,right:2.5,wait:4.5,enter:0.1,wait:2,eval=__game.world.freezeEnemies=true,wait:1,shot"
  ```

#### WORLD-CAM — world.js hook points for all features + camera API (L)

- **Spec:** MASTER_PLAN §1.6 world order; feel §4.1 hitstop runtime, §4.9 camera + kill slow-mo, §3.7, §9 WP2 (world.js, camera.js); world2 §3.3 world.js hooks, §3.8, §3.9; companions §12.3 world.js; platform §5.4 touch camera bias; integration notes: arena camera y bias, <bossId>_post scripts
- **Owns:** `src/game/world.js`, `src/core/camera.js`
- **Depends on:** SKEL, EXT-QAFIX
- **Provides:** world fields and every hook call site in §1.7 (world.js table); get liquid(), gimmickOf(kind); star shard / world heart collection + banners + bus shardFound/heartFound; door marks; camera: kick, addTrauma, shake (legacy → trauma), eased punchZoom, zoomPulse, roll, cine/cineEnd/frameOn, lookBoost, touch bias, bus shake (mag ≥ 8), arena y bias
- **Consumes:** Style + AW_GAIN (FEEL-IMPACT); createGimmick (GIMMICK-ENGINE); CompanionSystem (CMP-SYS; stub); fx.clearDecals (FEEL-REACT)
- **Notes:** Every line tagged per R4.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/validate_maps.mjs
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s04&room=boss" --out /tmp/claude-0/proto/WORLD-CAM --steps "wait:2.5,right:2.5,wait:4.5,enter:0.1,wait:1.5,enter:0.1,wait:2,attack:0.2,shot"
  ```

#### GAME-HOOKS — player.js hook lines in canonical order, moveProfile, stats aura hook, save schema v2 + migration (L)

- **Spec:** MASTER_PLAN §1.7 player order, §1.6 save v2; world2 §2.6, §3.3 player.js hooks; companions §12.3 player.js/stats.js/state.js, §8 migration call; feel §9 WP1 hook lines (moveId, buffers), WP5 ult line, §6.1 super armor
- **Owns:** `src/game/player.js`, `src/game/stats.js`, `src/game/state.js`, `tools/fixtures/save_v1.json`, `tools/test_save_v2.mjs`
- **Depends on:** SKEL
- **Provides:** all 30 tagged hook lines (no-ops against the stubs); moveProfile(gait) single movement profile; handleUltInput replaces the ult line; superArmor, awakenHoldK, lastDashEnd fields; makeAttack moveId; buffer compensation with world.frozenRecent; stats: addStats(s, companionAuraStats(state, hero)); SAVE_VERSION 2, progress.shards/hearts, migrateState order incl. migrateCompanions, ensureCompanionState in newGameState; v1 fixture
- **Consumes:** feel_move stubs; awaken stub; companion_state stubs
- **Notes:** Hooks only: no gameplay change is visible until the owners land (the stubs keep legacy behavior).
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
- **Provides:** ENEMIES_C (s14–s16), ENEMIES_D (s17–s20); BOSSES_C (narkissa, moloch, dagon, ziz), BOSSES_D (mara, behemoth, nihil); tier-7 constants/tables, materials, keys, uniques, mythics, MYTHIC_WEAPONS_P2; DOCS d21–d27, LORE l21–l34, LORE_ORDER, DOC_ORDER; every enemy drop material id exists in ITEMS (integration note)
- **Notes:** Numbers exactly as world2; Korean desc verbatim.
- **Tests:**
  ```
  node --input-type=module -e "const {ITEMS}=await import('./src/data/items.js'); const {ENEMIES}=await import('./src/data/enemies.js'); const miss=[]; for (const e of Object.values(ENEMIES)) for (const d of e.drops??[]) { const id=d.item??d.id??d[0]; if (typeof id==='string' && id.startsWith('m_') && !ITEMS[id]) miss.push(e.id+':'+id); } console.log(miss.length?miss:'ok')"
  node tools/validate_maps.mjs
  node tools/integration.mjs --only hub,menu
  ```

#### CMP-DATA — Companion roster data, state API, migration, bus wiring, recruit API (L)

- **Spec:** companions §1–2, §3.4, §3.9, §4.9, §8, §9, §12.1–12.2, §12.5, §13 (lines); world2 §2.4, §14; MASTER_PLAN §1.2 (ids, names, P2 stats)
- **Owns:** `src/data/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `tools/test_companion_state.mjs`, `tools/fixtures/save_ch6_nocmp.json`
- **Depends on:** SKEL
- **Provides:** 20 companions with the §1.2 ids, names, portraits, cries and numbers; formulas cexpToNext, guardianShare, trampleRatio, cdMul, BOND_RANKS/NAMES; state API companions §12.2; migrateCompanions / ensureCompanionState (idempotent, never throws); obtain type 'flag' for recruit_<id>; retro unlocks; initCompanions(game) sets game.companions = {recruit, unlock}; applyCompanionDebug(state, params)
- **Notes:** Pure data/state (Node-importable, imports only data and core/events.js).
- **Tests:**
  ```
  node tools/test_companion_state.mjs
  ```

#### ART-ENEMY-SPLIT — Mechanical split of the two enemy render files into four (M)

- **Spec:** MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a.js`, `src/render/enemies_a2.js`, `src/render/enemies_b.js`, `src/render/enemies_b2.js`, `src/render/enemies_shared.js`
- **Depends on:** SKEL, EXT-ARTBAKEOFF
- **Provides:** one file per ART-ENEMY package (lists in §1.15); RENDER_A, RENDER_B, PROJ_B, ZONE_B exported unchanged; shared helpers in enemies_shared.js
- **Notes:** No drawing change.
- **Tests:**
  ```
  node tools/.proto_ART-ENEMY-SPLIT/diff.mjs   # gallery_enemies_a/b screenshots pixel-identical before/after
  node tools/integration.mjs
  ```

#### ART-KIT — Shared art kit for the chosen approach (TBD) + render/boss registries (M)

- **Spec:** MASTER_PLAN §1.15; user requests #1/#2; world2 §0 art bar; companions §11 rendering rules
- **Owns:** `src/render/painted/**`, `src/render/art_kit.js`, `src/render/enemies.js`, `src/game/bosses/index.js`, `docs/art/**`, `tools/painted/**`, `tools/gallery_artkit.html`
- **Depends on:** GATE:ART-DECISION, SKEL
- **Provides:** painted: finalized kit.js/registry.js/enemy_kit.js + pipeline docs; vector_hd: art_kit.js (cached gradients, rim light, outline, glow sprites, cloth helpers); render/enemies.js merges RENDER_C/RENDER_D (+ painted draw hook); bosses/index.js merges BOSS_C/BOSS_D (+ painted preload); renderer contract and per-draw budget test (gallery perf loop)
- **Notes:** Takes over the bake-off's files once GATE:ART-DECISION is published; keeps only the chosen approach. Painted: restructure the enemy pipeline so each ART-ENEMY package keeps its own prompts file (tools/painted/<group>/prompts.mjs) instead of one shared file.
- **Tests:**
  ```
  node tools/integration.mjs
  node tools/.proto_ART-KIT/perf.mjs   # per-draw cost vs today's renderers
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
| **CMP-MOUNT** | MountRider runtime for 9 mounts | L | CMP-DATA, GAME-HOOKS, WORLD-CAM |
| **CMP-MOUNT-ART-A** | Mount rig and renderers: horse/boar templates — 그림메인, 바르그, 코슈타, 이그니스, 실바 | L | ART-KIT, CMP-DATA |
| **CMP-MOUNT-ART-B** | Mount renderers: wolf, wyvern, bat, griffin — 스콜, 스칼렛, 녹티스, 게일 | L | CMP-MOUNT-ART-A |
| **CMP-GUARD-ART-A** | Guardian renderers + FX helpers: 아리아, 하티, 핌, 가웨인, 크론, 미네르바 | M | ART-KIT, CMP-DATA |
| **CMP-GUARD-ART-B** | Guardian renderers: 틱톡, 모르스, 미라, 루멘, 모모 | M | CMP-GUARD-ART-A |
| **CMP-UI** | Companion HUD widgets and call-outs, 동료 menu tab, join reveal scene | L | CMP-DATA, HUD-LAYOUT, PLAT-INPUT, FONTS-FU |
| **CMP-TOWN** | Stable of Souls: town extension, Greta, facade, stable scene, companion scripts | L | CMP-DATA, EXT-QAFIX |
| **PLAT-MENU** | Menu system for touch, pad and scale (scroll fix, swipe, long-press, glyphs) + 동료 tab row | L | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS |
| **PLAT-TURNTABLE** | Hero turntable in status/equip/class tabs (interaction + interim fallback) | L | PLAT-INPUT, PLAT-CORE |
| **PLAT-FRONT** | Front scenes for touch/pad/scale + title features + arcade Part 2 + account screens | L | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS, EXT-QAFIX |
| **PLAT-OPTIONS** | Options pages, pad/keyboard remap screens, generated controls guide | L | PLAT-INPUT, PLAT-CORE, PLAT-SAVE-ASSETS, PLAT-TOUCH |
| **PLAT-TOWN** | Town scenes for touch/pad/scale + hub hooks (quick inventory, companions, optional sky crack) | L | PLAT-INPUT, PLAT-CORE, CMP-DATA, EXT-QAFIX |
| **PLAT-GAMES** | Minigames, pause, dialogue, results for touch/pad/scale + recruit cmd + s20 ending route | L | PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-QAFIX |
| **DELIVERY-WEB** | Web delivery tooling: allowlist build, Netlify config, service worker, asset variants | L | PLAT-CORE, EXT-ACCOUNTS |
| **MAPS-P2-A** | Maps s14–s16 and the Part 2 stage entries they need | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **MAPS-P2-B** | Maps s17–s18 | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **MAPS-P2-C** | Maps s19–s20 | L | GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA |
| **ENEMY-P2-C-AI** | Part 2 enemy AI kinds for s14–s16 (+ data tuning) | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT |
| **ENEMY-P2-C-ART** | Part 2 enemy renderers s14–s16 (12) | L | ART-KIT, P2-DATA |
| **ENEMY-P2-D-AI** | Part 2 enemy AI kinds for s17–s20 (+ data tuning) | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT |
| **ENEMY-P2-D-ART** | Part 2 enemy renderers s17–s20 (12) | L | ART-KIT, P2-DATA |
| **BOSS-P2-1** | Bosses 나르키사 and 몰록 (+ c_common helpers, boss data C, gallery) | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT |
| **BOSS-P2-2** | Bosses 다곤 and 지즈 | L | P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT |
| **BOSS-P2-3** | Bosses 마라 and 베헤모스 (+ boss data D, gallery) | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT |
| **BOSS-P2-4** | Final boss 니힐 | L | P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT |
| **STORY-P2-A** | Part 2 story A: prologue, chapters 14–17, endings, credits, story/ending scene changes | L | SKEL, FONTS-FU, PLAT-INPUT, PLAT-CORE, EXT-QAFIX |
| **STORY-P2-B** | Part 2 story B: chapters 18–20, NPC chapter lines, quest dialogues | L | SKEL |
| **ITEMS-P2** | Part 2 techniques, quests (incl. Greta's), shop, loot, icons; item text polish | L | P2-DATA, SKEL |
| **WORLDMAP-P2** | World map page 2, reveals, legacy-save prologue, map UI for touch/pad/scale | L | P2-DATA, PLAT-INPUT, PLAT-CORE, EXT-QAFIX |
| **ART-HERO-A** | Hero renderer overhaul: detail, gait/feel hooks, rider pose, equipment visuals (approach TBD) | L | ART-KIT, GATE:ART-DECISION |
| **ART-BOSS-1** | Boss art: 나이트윙, 밴시 여왕, 둘라한 (drawing only; approach TBD) | L | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-2** | Boss art: 진홍의 갑주군주, 본 드래곤, 그리모어 (approach TBD) | L | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-3** | Boss art: 키메라 호문쿨루스, 레비아탄, 태엽 거신 (approach TBD) | L | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-4** | Boss art: 서리 여왕 이자벨라, 사신 데스 (approach TBD) | L | ART-KIT, FEEL-BOSSHOOKS |
| **ART-BOSS-5** | Boss art: 드라큘라 백작 (both forms), 혼돈의 군주 (approach TBD) | L | ART-KIT, FEEL-BOSSHOOKS |
| **ART-ENEMY-1** | Enemy art: common + s01–s03 (19) (approach TBD) | L | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-2** | Enemy art: s04–s06 (15) (approach TBD) | L | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-3** | Enemy art: s07–s09 (14) + PROJ_B/ZONE_B (approach TBD) | L | ART-KIT, ART-ENEMY-SPLIT |
| **ART-ENEMY-4** | Enemy art: s10–s13 (19) (approach TBD) | L | ART-KIT, ART-ENEMY-SPLIT |

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
- **Provides:** castUltimate(p, world) passes {tier, accent, classId}; flash via policy; ultDirector ULTFX.begin/end; ultFinal → ULTFX.final with final:true (class S); ULTS.kael…azel changes; export FXKIT (existing helpers only)
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
- **Owns:** `src/game/companions.js`, `src/game/guardian.js`, `tools/test_guardians.mjs`
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

#### CMP-MOUNT — MountRider runtime for 9 mounts (L)

- **Spec:** companions §3 (all), §11.4 riderView; world2 §14 interplay; MASTER_PLAN §1.2 P2 mount table, §1.14
- **Owns:** `src/game/mount.js`, `tools/test_mount.mjs`
- **Depends on:** CMP-DATA, GAME-HOOKS, WORLD-CAM
- **Provides:** MountRider (states, fit/unstuck, profile, gallop ramp, turn, jump/glide/fly/swim/wall-kick, charge, 9 specials, landing impact, damage model, hazards, knock-off/recall/MountGhost, ult/awaken dismount + auto-remount, riderView, adaptMove, riderLift, hurtbox, heal); deep-water auto-dismount; def.windMul/blightMul; DISMOUNT_SKILLS (grep of skills.js)
- **Consumes:** mountPose (CMP-MOUNT-ART-A); p.ride in drawHero (ART-HERO-A)
- **Notes:** Until ART-HERO-A lands the rider may float standing on the saddle (development only).
- **Tests:**
  ```
  node tools/test_mount.mjs
  node tools/integration.mjs --only s01,s08
  ```

#### CMP-MOUNT-ART-A — Mount rig and renderers: horse/boar templates — 그림메인, 바르그, 코슈타, 이그니스, 실바 (L)

- **Spec:** companions §11.1–11.2; MASTER_PLAN §1.2, §1.15
- **Owns:** `src/render/mount_rig.js`, `src/render/mounts.js`, `tools/gallery_mounts.html`
- **Depends on:** ART-KIT, CMP-DATA
- **Provides:** mountPose, seatOf, templates horse/boar/stag; drawMount dispatcher (+ MOUNT_DRAW_B registry), drawMountIcon; all states incl. awakened variants and quality levels
- **Consumes:** MOUNT_DRAW_B (CMP-MOUNT-ART-B)
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_mounts.html" --out /tmp/claude-0/proto/CMP-MOUNT-ART-A --steps "wait:2,shot"
  node tools/.proto_CMP-MOUNT-ART-A/perf.mjs   # ≤ 0.35 ms per draw
  ```

#### CMP-MOUNT-ART-B — Mount renderers: wolf, wyvern, bat, griffin — 스콜, 스칼렛, 녹티스, 게일 (L)

- **Spec:** companions §11.1–11.2; MASTER_PLAN §1.2
- **Owns:** `src/render/mounts_b.js`
- **Depends on:** CMP-MOUNT-ART-A
- **Provides:** MOUNT_DRAW_B + rig templates wolf/wyvern/bat/griffin (registered into mount_rig via its template registry)
- **Consumes:** mount_rig template registry
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_mounts.html" --out /tmp/claude-0/proto/CMP-MOUNT-ART-B --steps "wait:2,shot"
  ```

#### CMP-GUARD-ART-A — Guardian renderers + FX helpers: 아리아, 하티, 핌, 가웨인, 크론, 미네르바 (M)

- **Spec:** companions §11.3
- **Owns:** `src/render/guardians.js`, `tools/gallery_guardians.html`
- **Depends on:** ART-KIT, CMP-DATA
- **Provides:** drawGuardian dispatcher (+ GUARDIAN_DRAW_B), drawGuardianIcon, FX helpers fxFairyDome … fxSecretOutline
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_guardians.html" --out /tmp/claude-0/proto/CMP-GUARD-ART-A --steps "wait:2,shot"
  ```

#### CMP-GUARD-ART-B — Guardian renderers: 틱톡, 모르스, 미라, 루멘, 모모 (M)

- **Spec:** companions §11.3; MASTER_PLAN §1.2
- **Owns:** `src/render/guardians_b.js`
- **Depends on:** CMP-GUARD-ART-A
- **Provides:** GUARDIAN_DRAW_B
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
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS
- **Provides:** Scroller.follow/shouldFollow; swipe tabs, long-press action menu, right-stick scroll; hintRow via prompts.legacyKey; Layer keys include ui.fontEpoch and clamp to the pixel budget; MENU_TABS companions row + 'paw' glyph; uiScale on the menu scene
- **Consumes:** prompts, game.uiK, ui.taps
- **Notes:** Keep the accounts' changes in tab_system.js.
- **Tests:**
  ```
  node tools/qa/platform_menu.mjs
  node tools/integration.mjs --only menu
  ```

#### PLAT-TURNTABLE — Hero turntable in status/equip/class tabs (interaction + interim fallback) (L)

- **Spec:** platform §7.1–7.3 (interim fallback), §11 WP-5, P-11; companions §7.2 (HeroStage reuse)
- **Owns:** `src/scenes/menu/hero_view.js`, `src/scenes/menu/tab_status.js`, `src/scenes/menu/tab_equip.js`, `src/scenes/menu/tab_class.js`, `tools/gallery_turntable.html`, `tools/qa/turntable.mjs`
- **Depends on:** PLAT-INPUT, PLAT-CORE
- **Provides:** HeroView yaw/yawVel/yawGoal/autoSpin; drag, inertia, snap, wheel, keys, right stick, touch buttons, equip reveal, showcase tween; HeroStage API unchanged for CMP-UI; offscreen passes clamped to the pixel budget
- **Consumes:** HERO_VIEW + opts.yaw (ART-HERO-B, W3; fallback until then)
- **Tests:**
  ```
  node tools/qa/turntable.mjs
  node tools/smoke.mjs --url "tools/gallery_turntable.html" --out /tmp/claude-0/proto/PLAT-TURNTABLE --steps "wait:3,shot"
  ```

#### PLAT-FRONT — Front scenes for touch/pad/scale + title features + arcade Part 2 + account screens (L)

- **Spec:** platform §11 WP-6 (all front files except options/story/ending), P-21/P-23, §9.4.6 APK link; world2 §11 arcade; fonts follow-ups (title logo, highscore, arcade_run); integration notes (arcade presets baseIdFor, survival pit room, slots drawSlot guard); MASTER_PLAN §1.16
- **Owns:** `src/scenes/title.js`, `src/scenes/front/common.js`, `src/scenes/front/slots.js`, `src/scenes/front/difficulty.js`, `src/scenes/front/charselect.js`, `src/scenes/front/highscore.js`, `src/scenes/front/dialogs.js`, `src/scenes/front/arcade.js`, `src/scenes/front/arcade_run.js`, `src/scenes/front/account.js`, `src/scenes/front/cloud_ui.js`, `src/scenes/reg_front.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-ACCOUNTS, EXT-QAFIX
- **Provides:** uiScale opt-in, glyph footers, 44 px targets for every front scene; title: bloodText logo, update prompt, audio hint, add-to-home card, APK link; arcade: Part 2 courses/presets, wtier 7, p2Known; account/cloud screens adopt the platform UI rules
- **Consumes:** prompts, game.uiK, platform.onUpdateReady
- **Tests:**
  ```
  node tools/integration.mjs --only title,arcade
  node tools/qa/platform_view.mjs
  ```

#### PLAT-OPTIONS — Options pages, pad/keyboard remap screens, generated controls guide (L)

- **Spec:** platform §10 (pages), §4.7 (remap UI), P-29; feel §7 rows; companions §6 (guide rows); MASTER_PLAN §1.4, §1.5
- **Owns:** `src/scenes/front/options.js`, `src/scenes/front/options_controls.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, PLAT-SAVE-ASSETS, PLAT-TOUCH
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
- **Depends on:** PLAT-INPUT, PLAT-CORE, CMP-DATA, EXT-QAFIX
- **Provides:** glyph hints, uiScale, list rows ≥ 36 CSS px; hub: map → menu inventory; NO_COMBAT += 'guard'; companionHubEnter on enter/onResume; boardInfo.stableNote; door 'scene:stable'; optional Part 2 sky crack
- **Consumes:** companionHubEnter/companionHubNote (CMP-SYS; stub)
- **Tests:**
  ```
  node tools/integration.mjs --only hub
  node tools/qa/platform_view.mjs
  ```

#### PLAT-GAMES — Minigames, pause, dialogue, results for touch/pad/scale + recruit cmd + s20 ending route (L)

- **Spec:** platform §11 WP-7 (games, pause, dialogue, results); world2 §2.3 (results toEnding s20), §2.4 (recruit in dialogue.js); fonts follow-ups (results, slot JACKPOT); integration notes (pause return to the gate, dialogue portrait fade, results routing)
- **Owns:** `src/scenes/games/**`, `src/scenes/pause.js`, `src/scenes/dialogue.js`, `src/scenes/results.js`, `src/scenes/reg_games.js`
- **Depends on:** PLAT-INPUT, PLAT-CORE, FONTS-FU, EXT-QAFIX
- **Provides:** uiScale + glyphs + sizes; B/Esc opens '그만두기' confirm in minigames; dialogue {cmd:'recruit'}; results toEnding for s12/s13/s20; bloodText STAGE CLEAR/rank/JACKPOT
- **Consumes:** game.companions?.recruit (CMP-DATA)
- **Tests:**
  ```
  node tools/integration.mjs --only inn,s01
  node tools/qa/platform_view.mjs
  ```

#### DELIVERY-WEB — Web delivery tooling: allowlist build, Netlify config, service worker, asset variants (L)

- **Spec:** platform §9.1–9.3, §6.7 variants, P-08, P-10; docs/ACCOUNTS.md (functions); MASTER_PLAN §1.20
- **Owns:** `netlify.toml`, `sw.js`, `robots.txt`, `tools/deploy/**`, `tools/assets/make_variants.py`, `assets/lo/**`
- **Depends on:** PLAT-CORE, EXT-ACCOUNTS
- **Provides:** build_web.mjs (allowlist, deny check, build.json, modulepreload, build-info.js, stamped URLs, SW precache injection, sizes); serve_dist.mjs (brotli + headers); smoke_deployed.mjs; sw.js per §1.20; netlify.toml per §1.20; make_variants.py → assets/lo/
- **Notes:** Never deploy from here; DELIVER-WEB (W4) deploys.
- **Tests:**
  ```
  node tools/deploy/build_web.mjs
  node tools/deploy/build_web.mjs --selftest-deny   # a dummy keystore in an allowlisted dir must fail the build
  node tools/qa/platform_load.mjs --dist
  ```

#### MAPS-P2-A — Maps s14–s16 and the Part 2 stage entries they need (L)

- **Spec:** world2 §4.2 (s14–s16 entries, header comment), §4.3 (s14, s15, s16)
- **Owns:** `src/data/maps/s14.js`, `src/data/maps/s15.js`, `src/data/maps/s16.js`, `src/data/stages.js`
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S14–S16 rooms per §4.3; stages s14, s15, s16 inserted after their anchors
- **Consumes:** validator rules, enemy/item/doc ids
- **Notes:** Owns stages.js this wave; MAPS-P2-B/C only append after their anchors.
- **Tests:**
  ```
  node tools/validate_maps.mjs s14 && node tools/validate_maps.mjs s15 && node tools/validate_maps.mjs s16
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s14&room=r1" --out /tmp/claude-0/proto/MAPS-P2-A --steps "wait:3,right:2,up:0.1,wait:0.3,right:2,shot"
  ```

#### MAPS-P2-B — Maps s17–s18 (L)

- **Spec:** world2 §4.2 (s17, s18 entries), §4.3 (s17, s18)
- **Owns:** `src/data/maps/s17.js`, `src/data/maps/s18.js`
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 map imports s17–s18 (MAPS-P2-B) ──`: import { ROOMS as S17 } from './maps/s17.js'; import { ROOMS as S18 } from './maps/s18.js';
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 stages s17–s18 (MAPS-P2-B) ──`: s17: S({…}), s18: S({…}) exactly as world2 §4.2
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S17–S18 rooms; stages s17, s18
- **Tests:**
  ```
  node tools/validate_maps.mjs s17 && node tools/validate_maps.mjs s18
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s18&room=r2" --out /tmp/claude-0/proto/MAPS-P2-B --steps "wait:3,right:1.5,shot"
  ```

#### MAPS-P2-C — Maps s19–s20 (L)

- **Spec:** world2 §4.2 (s19, s20 entries), §4.3 (s19, s20; l33/l34 placement §8)
- **Owns:** `src/data/maps/s19.js`, `src/data/maps/s20.js`
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 map imports s19–s20 (MAPS-P2-C) ──`: import { ROOMS as S19 } from './maps/s19.js'; import { ROOMS as S20 } from './maps/s20.js';
- **Appends to** `src/data/stages.js` directly after the line `// ── P2 stages s19–s20 (MAPS-P2-C) ──`: s19: S({…}), s20: S({…}) exactly as world2 §4.2
- **Depends on:** GIMMICK-ENGINE, GIMMICK-KINDS-B, GIMMICK-RENDER, P2-DATA
- **Provides:** S19–S20 rooms; stages s19, s20
- **Tests:**
  ```
  node tools/validate_maps.mjs s19 && node tools/validate_maps.mjs s20
  node tools/smoke.mjs --url "index.html?scene=stage&stage=s20&room=r1" --out /tmp/claude-0/proto/MAPS-P2-C --steps "wait:5,right:3,shot"
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

#### ENEMY-P2-C-ART — Part 2 enemy renderers s14–s16 (12) (L)

- **Spec:** world2 §5.1 render rules, §5.4; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_c.js`, `tools/gallery_enemies_c.html`
- **Depends on:** ART-KIT, P2-DATA
- **Provides:** RENDER_C (+ PROJ_C/ZONE_C) for 12 enemies, every anim
- **Consumes:** art kit
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

#### ENEMY-P2-D-ART — Part 2 enemy renderers s17–s20 (12) (L)

- **Spec:** world2 §5.1 render rules, §5.4; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_d.js`, `tools/gallery_enemies_d.html`
- **Depends on:** ART-KIT, P2-DATA
- **Provides:** RENDER_D, PROJ_D, ZONE_D
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_d.html" --out /tmp/claude-0/proto/ENEMY-P2-D-ART --steps "wait:3,shot"
  ```

#### BOSS-P2-1 — Bosses 나르키사 and 몰록 (+ c_common helpers, boss data C, gallery) (L)

- **Spec:** world2 §6.1–6.3, §1.3 phase-script rules; MASTER_PLAN §1.13, §1.14
- **Owns:** `src/game/bosses/c_common.js`, `src/game/bosses/c_narkissa.js`, `src/game/bosses/c_moloch.js`, `src/data/bosses_c.js`, `tools/gallery_bosses_c.html`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT
- **Provides:** classes extending BossB with the contracted state names; c_common helpers (honor freezeEnemies, defer phase scripts while cutscene); gallery page listing every BOSSES_C entry
- **Consumes:** gimmickOf('magma'); art kit
- **Notes:** b_narkissa_shatter pushed once in story mode.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/BOSS-P2-1 --steps "wait:3,shot"
  node tools/.proto_BOSS-P2-1/patterns.mjs   # debugAct every pattern, debugPhase each phase
  ```

#### BOSS-P2-2 — Bosses 다곤 and 지즈 (L)

- **Spec:** world2 §6.1, §6.4, §6.5
- **Owns:** `src/game/bosses/c_dagon.js`, `src/game/bosses/c_ziz.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT
- **Provides:** Dagon (flood via deep.setWaterRow), Ziz (gust via wind)
- **Consumes:** c_common.js after BOSS-P2-1 lands (otherwise local helpers)
- **Notes:** Needs data changes? Use R7 requests to BOSS-P2-1 (owner of data/bosses_c.js).
- **Tests:**
  ```
  node tools/.proto_BOSS-P2-2/patterns.mjs
  node tools/smoke.mjs --url "tools/gallery_bosses_c.html" --out /tmp/claude-0/proto/BOSS-P2-2 --steps "wait:3,shot"
  ```

#### BOSS-P2-3 — Bosses 마라 and 베헤모스 (+ boss data D, gallery) (L)

- **Spec:** world2 §6.1, §6.6, §6.7
- **Owns:** `src/game/bosses/d_mara.js`, `src/game/bosses/d_behemoth.js`, `src/data/bosses_d.js`, `tools/gallery_bosses_d.html`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT
- **Provides:** Mara (dreamshift, falseDawn never touches cleared), Behemoth (blight clouds/pods)
- **Consumes:** gimmickOf('heartbeat'|'blight')
- **Tests:**
  ```
  node tools/.proto_BOSS-P2-3/patterns.mjs
  node tools/smoke.mjs --url "tools/gallery_bosses_d.html" --out /tmp/claude-0/proto/BOSS-P2-3 --steps "wait:3,shot"
  ```

#### BOSS-P2-4 — Final boss 니힐 (L)

- **Spec:** world2 §6.1, §6.8; MASTER_PLAN §1.14 (final: sp 100, aw 100 at tier ≥ 1)
- **Owns:** `src/game/bosses/d_nihil.js`
- **Depends on:** P2-DATA, GIMMICK-ENGINE, GIMMICK-KINDS-B, FEEL-REACT, FEEL-BOSSHOOKS, ART-KIT
- **Provides:** Nihil 4 phases, echoes, collapse via voidwall, final transition
- **Consumes:** gimmickOf('voidwall')
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

#### ART-HERO-A — Hero renderer overhaul: detail, gait/feel hooks, rider pose, equipment visuals (approach TBD) (L)

- **Spec:** user request #1; feel §3.3.3 (hook); companions §11.4 (rider); world2 §7.2 (rift visual); MASTER_PLAN §1.7 hero order, §1.15
- **Owns:** `src/render/hero.js`, `src/render/hero_parts.js`, `src/render/hero_puppet.js`, `tools/gallery_hero.html`, `tools/puppet/**`, `assets/puppets/**`
- **Depends on:** ART-KIT, GATE:ART-DECISION
- **Provides:** drawHero detail upgrade per the lead's approach; gait/feel hooks per §1.7; p.ride seated pose; equipment and class looks still visible; drawHero opts contract (tint/alpha/ghost/scale)
- **Consumes:** hero_gait.js (FEEL-MOVE); riderView (CMP-MOUNT)
- **Notes:** Takes over the bake-off's hero.js hooks and hero_puppet.js.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_hero.html" --out /tmp/claude-0/proto/ART-HERO-A --steps "wait:3,shot"
  node tools/integration.mjs
  node tools/.proto_ART-HERO-A/perf.mjs   # gameplay drawHero ≤ 1.3× today
  ```

#### ART-BOSS-1 — Boss art: 나이트윙, 밴시 여왕, 둘라한 (drawing only; approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_nightwing.js`, `src/game/bosses/a_banshee.js`, `src/game/bosses/a_dullahan.js`, `assets/painted/b_nightwing/**`, `assets/painted/b_banshee/**`, `assets/painted/b_dullahan/**`, `tools/painted/b_nightwing/**`, `tools/painted/b_banshee/**`, `tools/painted/b_dullahan/**`, `tools/kling/manifest_art-boss-1.json`
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** grotesque multi-part art, all states/phases, flash, death
- **Consumes:** art kit
- **Notes:** No pattern/timing/hitbox changes.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_a.html" --out /tmp/claude-0/proto/ART-BOSS-1 --steps "wait:3,shot"
  node tools/integration.mjs --only s01_boss,s02_boss,s03_boss
  ```

#### ART-BOSS-2 — Boss art: 진홍의 갑주군주, 본 드래곤, 그리모어 (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_crimson.js`, `src/game/bosses/a_bonedragon.js`, `src/game/bosses/a_grimoire.js`, `assets/painted/b_crimson/**`, `assets/painted/b_bonedragon/**`, `assets/painted/b_grimoire/**`, `tools/painted/b_crimson/**`, `tools/painted/b_bonedragon/**`, `tools/painted/b_grimoire/**`, `tools/kling/manifest_art-boss-2.json`
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1 (Bone Dragon starts from the bake-off prototype)
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_a.html" --out /tmp/claude-0/proto/ART-BOSS-2 --steps "wait:3,shot"
  node tools/integration.mjs --only s04_boss,s05_boss,s06_boss
  ```

#### ART-BOSS-3 — Boss art: 키메라 호문쿨루스, 레비아탄, 태엽 거신 (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/a_chimera.js`, `src/game/bosses/b_leviathan.js`, `src/game/bosses/b_colossus.js`, `assets/painted/b_chimera/**`, `assets/painted/b_leviathan/**`, `assets/painted/b_colossus/**`, `tools/painted/b_chimera/**`, `tools/painted/b_leviathan/**`, `tools/painted/b_colossus/**`, `tools/kling/manifest_art-boss-3.json`
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-3 --steps "wait:3,shot"
  node tools/integration.mjs --only s07_boss,s08_boss,s09_boss
  ```

#### ART-BOSS-4 — Boss art: 서리 여왕 이자벨라, 사신 데스 (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/b_frostqueen.js`, `src/game/bosses/b_death.js`, `assets/painted/b_frostqueen/**`, `assets/painted/b_death/**`, `tools/painted/b_frostqueen/**`, `tools/painted/b_death/**`, `tools/kling/manifest_art-boss-4.json`
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-4 --steps "wait:3,shot"
  node tools/integration.mjs --only s10_boss,s11_boss
  ```

#### ART-BOSS-5 — Boss art: 드라큘라 백작 (both forms), 혼돈의 군주 (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/game/bosses/b_dracula.js`, `src/game/bosses/b_chaos.js`, `assets/painted/b_dracula/**`, `assets/painted/b_chaos/**`, `tools/painted/b_dracula/**`, `tools/painted/b_chaos/**`, `tools/kling/manifest_art-boss-5.json`
- **Depends on:** ART-KIT, FEEL-BOSSHOOKS
- **Provides:** as ART-BOSS-1
- **Consumes:** art kit
- **Notes:** The Dracula phase-2 script issue (integration notes) is behavior: log it via R7 for W4 FIX-AI-BOSS.
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_bosses_b.html" --out /tmp/claude-0/proto/ART-BOSS-5 --steps "wait:3,shot"
  node tools/integration.mjs --only s12_boss,s13_boss
  ```

#### ART-ENEMY-1 — Enemy art: common + s01–s03 (19) (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a.js`, `assets/painted/enemies_a/**`, `tools/painted/enemies_a/**`, `tools/kling/manifest_art-enemy-1.json`
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 19 renderers at the new bar, every anim
- **Consumes:** art kit, enemies_shared.js (read-only)
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_a.html" --out /tmp/claude-0/proto/ART-ENEMY-1 --steps "wait:3,shot"
  node tools/integration.mjs --only s01,s02,s03
  ```

#### ART-ENEMY-2 — Enemy art: s04–s06 (15) (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_a2.js`, `assets/painted/enemies_a2/**`, `tools/painted/enemies_a2/**`, `tools/kling/manifest_art-enemy-2.json`
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 15 renderers
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_a.html" --out /tmp/claude-0/proto/ART-ENEMY-2 --steps "wait:3,shot"
  node tools/integration.mjs --only s04,s05,s06
  ```

#### ART-ENEMY-3 — Enemy art: s07–s09 (14) + PROJ_B/ZONE_B (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_b.js`, `assets/painted/enemies_b/**`, `tools/painted/enemies_b/**`, `tools/kling/manifest_art-enemy-3.json`
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 14 renderers + projectile/zone renderers
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_b.html" --out /tmp/claude-0/proto/ART-ENEMY-3 --steps "wait:3,shot"
  node tools/integration.mjs --only s07,s08,s09
  ```

#### ART-ENEMY-4 — Enemy art: s10–s13 (19) (approach TBD) (L)

- **Spec:** user request #2; MASTER_PLAN §1.15
- **Owns:** `src/render/enemies_b2.js`, `assets/painted/enemies_b2/**`, `tools/painted/enemies_b2/**`, `tools/kling/manifest_art-enemy-4.json`
- **Depends on:** ART-KIT, ART-ENEMY-SPLIT
- **Provides:** 19 renderers
- **Consumes:** art kit
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/gallery_enemies_b.html" --out /tmp/claude-0/proto/ART-ENEMY-4 --steps "wait:3,shot"
  node tools/integration.mjs --only s10,s11,s12,s13
  ```

### W3 — Second pass, harnesses, APK follow-ups, docs

| key | title | size | depends on |
|---|---|---|---|
| **ART-HERO-B** | Hero view angles for the turntable (HERO_VIEW, opts.yaw) | L | ART-HERO-A, PLAT-TURNTABLE |
| **HUD-FINAL** | HUD second pass with the real widgets | S | FEEL-HUD, CMP-UI, GIMMICK-ENGINE, GIMMICK-KINDS-B, PLAT-CORE |
| **HOOK-SWEEP** | Apply queued cross-package requests to frozen engine/UI files | M | FEEL-MOVE, FX-ULTS, OVERLAYS, AWAKEN-CORE, CMP-SYS, CMP-MOUNT |
| **QA-TOOLS** | Final QA tooling: platform suite update, commands, perf budget, soak, visual review | M | PLAT-QA, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES |
| **FEEL-QA** | Feel acceptance harness | M | FEEL-MOVE, FEEL-HUD, FX-ULTS, FX-ULTKIT, AWAKEN-DIR-A, AWAKEN-DIR-B, OVERLAYS |
| **CMP-QA** | Companion end-to-end, balance model, room-fit scan | M | CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-ART-B, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-TOWN |
| **P2-QA** | Part 2 acceptance suite, integration cases s14–s20, balance --check | L | MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, PLAT-GAMES, EXT-MUSIC-P2 |
| **APK-FU** | APK follow-ups: /api proxy, WebView gate, insets and rumble bridges, dist/web packing | L | DELIVERY-WEB, EXT-APK |
| **DOCS-ARCH** | ARCHITECTURE.md update for every new contract | M | FEEL-MOVE, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, ITEMS-P2, STORY-P2-A, PLAT-OPTIONS, WORLDMAP-P2 |

#### ART-HERO-B — Hero view angles for the turntable (HERO_VIEW, opts.yaw) (L)

- **Spec:** platform §7.3; MASTER_PLAN §1.7 hero order (steps 1 and 7)
- **Owns:** `src/render/hero.js`, `src/render/hero_parts.js`, `src/render/hero_puppet.js`, `tools/gallery_hero.html`, `tools/puppet/**`, `assets/puppets/**`
- **Depends on:** ART-HERO-A, PLAT-TURNTABLE
- **Provides:** export HERO_VIEW {continuous, steps}; opts.yaw views: front/back/3-4 with correct equipment, cape, wings, hair; cross-over squash between steps
- **Tests:**
  ```
  node tools/qa/turntable.mjs   # acceptance 5: front vs back differ > 8%, symmetric, cape covers back
  node tools/smoke.mjs --url "tools/gallery_turntable.html" --out /tmp/claude-0/proto/ART-HERO-B --steps "wait:3,shot"
  ```

#### HUD-FINAL — HUD second pass with the real widgets (S)

- **Spec:** MASTER_PLAN §1.8; platform §4.5 HUD glyph adoption
- **Owns:** `src/render/hud.js`, `src/render/hud_layout.js`, `tools/test_hud_layout.mjs`
- **Depends on:** FEEL-HUD, CMP-UI, GIMMICK-ENGINE, GIMMICK-KINDS-B, PLAT-CORE
- **Provides:** overlap matrix green with real feel_hud, companion_hud, gimmick meters and toasts; legacy combo block removed once feel_hud draws
- **Tests:**
  ```
  node tools/test_hud_layout.mjs
  node tools/integration.mjs --mobile --only s04_boss
  ```

#### HOOK-SWEEP — Apply queued cross-package requests to frozen engine/UI files (M)

- **Spec:** MASTER_PLAN R7, R14
- **Owns:** `src/game/world.js`, `src/game/player.js`, `src/game/combat.js`, `src/game/enemy.js`, `src/game/stats.js`, `src/game/state.js`, `src/game/skills.js`, `src/game/tilemap.js`, `src/game/props.js`, `src/core/game.js`, `src/core/input.js`, `src/core/ui.js`, `src/core/save.js`, `src/core/camera.js`, `src/core/particles.js`, `src/core/audio.js`, `src/core/touchpad.js`, `src/main.js`, `src/scenes/stage.js`, `src/scenes/overlays.js`, `src/scenes/index.js`
- **Depends on:** FEEL-MOVE, FX-ULTS, OVERLAYS, AWAKEN-CORE, CMP-SYS, CMP-MOUNT
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
- **Depends on:** PLAT-QA, PLAT-MENU, PLAT-TURNTABLE, PLAT-FRONT, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES
- **Provides:** platform tests cover awaken/mount/guard bindings and the canvas touch buttons; tools/qa/commands.mjs, perf_budget.mjs, soak.mjs, visual_review.mjs, run_all.mjs
- **Tests:**
  ```
  node tools/qa/run_platform.mjs
  node tools/qa/perf_budget.mjs --profiles desk --quick
  ```

#### FEEL-QA — Feel acceptance harness (M)

- **Spec:** feel §10
- **Owns:** `tools/feel_test.mjs`
- **Depends on:** FEEL-MOVE, FEEL-HUD, FX-ULTS, FX-ULTKIT, AWAKEN-DIR-A, AWAKEN-DIR-B, OVERLAYS
- **Provides:** M1–M6, C1–C15, U1–U2, A1–A8, V1 with /tmp/claude-0/qa_feel/report.json
- **Notes:** Failures found here are filed as W4 defects (the harness owner does not fix engine code).
- **Tests:**
  ```
  node tools/feel_test.mjs
  ```

#### CMP-QA — Companion end-to-end, balance model, room-fit scan (M)

- **Spec:** companions §14 C10 (checklist 1–10); MASTER_PLAN §1.2 (P2 check points)
- **Owns:** `tools/test_companions.mjs`, `tools/balance_companions.mjs`, `tools/scan_mount_fit.mjs`
- **Depends on:** CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-MOUNT-ART-B, CMP-GUARD-ART-B, CMP-UI, CMP-TOWN, PLAT-TOWN
- **Provides:** C10 checklist incl. Part 2 companions (recruit flags, deep dismount, wind/blight multipliers)
- **Tests:**
  ```
  node tools/test_companions.mjs
  node tools/balance_companions.mjs
  node tools/scan_mount_fit.mjs
  ```

#### P2-QA — Part 2 acceptance suite, integration cases s14–s20, balance --check (L)

- **Spec:** world2 §15, §17; MASTER_PLAN §5.1
- **Owns:** `tools/test_part2.mjs`, `tools/integration.mjs`, `tools/balance.mjs`
- **Depends on:** MAPS-P2-A, MAPS-P2-B, MAPS-P2-C, BOSS-P2-1, BOSS-P2-2, BOSS-P2-3, BOSS-P2-4, STORY-P2-A, STORY-P2-B, ITEMS-P2, WORLDMAP-P2, ENEMY-P2-C-AI, ENEMY-P2-C-ART, ENEMY-P2-D-AI, ENEMY-P2-D-ART, PLAT-GAMES, EXT-MUSIC-P2
- **Provides:** test_part2.mjs (--static and runtime tests 4–12); integration.mjs STAGES += s14–s20 (+ boss rooms); balance.mjs Part 2 rows + --check
- **Tests:**
  ```
  node tools/test_part2.mjs --static
  node tools/test_part2.mjs
  node tools/integration.mjs --only s14,s15,s16,s17,s18,s19,s20
  node tools/balance.mjs normal kael --check
  ```

#### APK-FU — APK follow-ups: /api proxy, WebView gate, insets and rumble bridges, dist/web packing (L)

- **Spec:** platform §9.4 items 1–6, P-32/P-33/P-34; docs/ACCOUNTS.md §1 (proxy); MASTER_PLAN §1.20
- **Owns:** `android/**`, `tools/apk/**`
- **Depends on:** DELIVERY-WEB, EXT-APK
- **Provides:** AssetServer proxy of /api/* to the origin in tools/apk/api_origin.txt (placeholder until W4); WebView ≥ 98 gate; __BN_INSETS + bn-insets; BNAndroid.rumble; WEB_FILES = dist/web minus sw.js and downloads/; MIME table
- **Notes:** Keystore handling unchanged (never generate a new key over an existing keystore.properties).
- **Tests:**
  ```
  node tools/deploy/build_web.mjs && tools/apk/build_apk.sh --verify
  node tools/apk/verify_apk.mjs
  ```

#### DOCS-ARCH — ARCHITECTURE.md update for every new contract (M)

- **Spec:** world2 WP-J docs; all four specs; MASTER_PLAN §1
- **Owns:** `docs/ARCHITECTURE.md`
- **Depends on:** FEEL-MOVE, AWAKEN-CORE, CMP-SYS, CMP-MOUNT, ITEMS-P2, STORY-P2-A, PLAT-OPTIONS, WORLDMAP-P2
- **Provides:** actions/bindings, settings, save v2, hooks, HUD regions, SFX, events, scenes, Part 2 ids/chars/gimmicks/scripts, companion ids, test commands
- **Notes:** Korean like the existing document.
- **Tests:**
  ```
  grep -c 'awakenCutin\|gimmickOf\|mt_warhorse\|settingsVersion' docs/ARCHITECTURE.md
  ```

### W4 — Final integration and QA: full regression, performance budgets, loop until dry

| key | title | size | depends on |
|---|---|---|---|
| **QA-ROUND** | Full regression round runner and triage (repeat per round) | M | ART-HERO-B, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH |
| **PERF-MOBILE** | Performance budget measurement on mobile settings (per round) | M | QA-ROUND |

The 16 fix buckets are spawned per round (one agent per bucket with defects). Their ownership globs are in §5.3; in the JSON each bucket is a package that depends on QA-ROUND.


#### QA-ROUND — Full regression round runner and triage (repeat per round) (M)

- **Spec:** MASTER_PLAN §5.1, §5.3
- **Owns:** no repository file
- **Depends on:** ART-HERO-B, HUD-FINAL, HOOK-SWEEP, QA-TOOLS, FEEL-QA, CMP-QA, P2-QA, APK-FU, DOCS-ARCH
- **Provides:** /tmp/claude-0/qa/round_<N>/defects.json + screenshots + bucket assignment
- **Consumes:** every suite in §5.1
- **Notes:** Owns no repository file; writes only under /tmp/claude-0/qa/.
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

### W5 — Delivery (closing step of the final wave, after GATE:QA-DRY)

| key | title | size | depends on |
|---|---|---|---|
| **DELIVER-WEB** | Build dist/web, create the Netlify site, deploy with functions, smoke the deployment | M | GATE:QA-DRY |
| **DELIVER-APK** | Final APK with the /api proxy to the live site | M | DELIVER-WEB |
| **DELIVER-ARTIFACT** | Republish the claude.ai artifact with the fonts | S | GATE:QA-DRY |
| **DELIVER-HANDOFF** | Keystore hand-off and release notes | S | DELIVER-APK, DELIVER-ARTIFACT |
| **QA-SIGNOFF** | Final smoke on the deployed site, the APK and the artifact | S | DELIVER-HANDOFF |

#### DELIVER-WEB — Build dist/web, create the Netlify site, deploy with functions, smoke the deployment (M)

- **Spec:** platform §9.1–9.3; docs/ACCOUNTS.md; MASTER_PLAN §5.4 steps 2–4 and 7
- **Owns:** `netlify.toml`, `sw.js`, `robots.txt`, `tools/deploy/**`, `tools/assets/make_variants.py`, `assets/lo/**`, `dist/web/**`, `!dist/web/downloads/**`
- **Depends on:** GATE:QA-DRY
- **Provides:** https://<site> live with /api/*; dist/web build report
- **Notes:** Starts only after GATE:QA-DRY; delivery defects found before that were fixed by the W4 FIX-DELIVERY bucket.
- **Tests:**
  ```
  node tools/deploy/build_web.mjs
  node tools/deploy/smoke_deployed.mjs https://<site>
  ```

#### DELIVER-APK — Final APK with the /api proxy to the live site (M)

- **Spec:** platform §9.4; MASTER_PLAN §5.4 steps 5–6
- **Owns:** `android/**`, `tools/apk/**`, `dist/BloodNocturne.apk`, `dist/web/downloads/**`
- **Depends on:** DELIVER-WEB
- **Provides:** signed APK ≤ 20 MB, versioned copy, latest.json
- **Notes:** DELIVER-WEB redeploys after this (step 7). dist/web/downloads/** is written here; DELIVER-WEB does not touch it.
- **Tests:**
  ```
  tools/apk/build_apk.sh --verify
  node tools/apk/verify_apk.mjs
  ```

#### DELIVER-ARTIFACT — Republish the claude.ai artifact with the fonts (S)

- **Spec:** MASTER_PLAN §5.4 step 8; integration notes (artifact must include assets/fonts)
- **Owns:** `tools/artifact/**`
- **Depends on:** GATE:QA-DRY
- **Provides:** updated artifact link
- **Tests:**
  ```
  node tools/smoke.mjs --url "tools/artifact/blood_nocturne.html" --out /tmp/claude-0/proto/DELIVER-ARTIFACT --steps "wait:4,enter:0.1,wait:2,shot"
  ```

#### DELIVER-HANDOFF — Keystore hand-off and release notes (S)

- **Spec:** MASTER_PLAN §5.4 step 9; platform §9.4 item 7
- **Owns:** `docs/RELEASE.md`
- **Depends on:** DELIVER-APK, DELIVER-ARTIFACT
- **Provides:** keystore + keystore.properties delivered privately; docs/RELEASE.md
- **Tests:**
  ```
  test -f tools/android/release.keystore && ! grep -qi password docs/RELEASE.md
  ```

#### QA-SIGNOFF — Final smoke on the deployed site, the APK and the artifact (S)

- **Spec:** MASTER_PLAN §5.3 last rule, §5.4 step 10
- **Owns:** no repository file
- **Depends on:** DELIVER-HANDOFF
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

| file | W0 | W1 | W2 | W3 | W4 | W5 | external owner (§0.2) |
|---|---|---|---|---|---|---|---|
| `src/game/player.js` | — | GAME-HOOKS | FEEL-MOVE | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/world.js` | — | WORLD-CAM | — | HOOK-SWEEP | FIX-ENGINE | — | EXT-QAFIX |
| `src/game/combat.js` | — | FEEL-IMPACT | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/enemy.js` | — | FEEL-REACT | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/skills.js` | SKEL | — | FX-ULTS | HOOK-SWEEP | FIX-SYSTEMS | — | — |
| `src/game/state.js` | — | GAME-HOOKS | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/stats.js` | — | GAME-HOOKS | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/tilemap.js` | — | GIMMICK-ENGINE | — | HOOK-SWEEP | FIX-ENGINE | — | EXT-QAFIX |
| `src/game/props.js` | — | GIMMICK-ENGINE | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/game/ai.js` | SKEL | — | — | — | FIX-AI-BOSS | — | — |
| `src/game/quests.js` | — | — | ITEMS-P2 | — | FIX-SYSTEMS | — | — |
| `src/game/loot.js` | — | — | ITEMS-P2 | — | FIX-SYSTEMS | — | — |
| `src/game/bosses/index.js` | — | ART-KIT | — | — | FIX-AI-BOSS | — | EXT-ARTBAKEOFF |
| `src/game/bosses/boss.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — |
| `src/game/bosses/a_common.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — |
| `src/game/bosses/b_common.js` | — | FEEL-BOSSHOOKS | — | — | FIX-AI-BOSS | — | — |
| `src/game/bosses/a_bonedragon.js` | — | — | ART-BOSS-2 | — | FIX-AI-BOSS | — | EXT-ARTBAKEOFF |
| `src/core/game.js` | — | PLAT-CORE | — | HOOK-SWEEP | FIX-PLATFORM | — | EXT-QAFIX |
| `src/core/input.js` | — | PLAT-INPUT | — | HOOK-SWEEP | FIX-PLATFORM | — | EXT-ACCOUNTS |
| `src/core/ui.js` | — | FONTS-FU | — | HOOK-SWEEP | FIX-PLATFORM | — | EXT-FONTS |
| `src/core/save.js` | — | PLAT-SAVE-ASSETS | — | HOOK-SWEEP | FIX-PLATFORM | — | EXT-ACCOUNTS |
| `src/core/assets.js` | — | PLAT-SAVE-ASSETS | — | — | FIX-PLATFORM | — | — |
| `src/core/audio.js` | — | AUDIO-FEEL | — | HOOK-SWEEP | FIX-AUDIO-MUSIC | — | — |
| `src/core/camera.js` | — | WORLD-CAM | — | HOOK-SWEEP | FIX-ENGINE | — | EXT-QAFIX |
| `src/core/particles.js` | — | FEEL-REACT | — | HOOK-SWEEP | FIX-ENGINE | — | — |
| `src/core/events.js` | SKEL | — | — | — | FIX-ENGINE | — | — |
| `src/main.js` | — | PLAT-CORE | — | HOOK-SWEEP | FIX-PLATFORM | — | — |
| `src/render/hero.js` | — | — | ART-HERO-A | ART-HERO-B | FIX-RENDER | — | EXT-ARTBAKEOFF |
| `src/render/hud.js` | — | HUD-LAYOUT | — | HUD-FINAL | FIX-HUD | — | — |
| `src/render/enemies.js` | — | ART-KIT | — | — | FIX-RENDER | — | EXT-ARTBAKEOFF |
| `src/render/enemies_a.js` | — | ART-ENEMY-SPLIT | ART-ENEMY-1 | — | FIX-RENDER | — | — |
| `src/render/enemies_b.js` | — | ART-ENEMY-SPLIT | ART-ENEMY-3 | — | FIX-RENDER | — | — |
| `src/render/tiles.js` | — | GIMMICK-RENDER | — | — | FIX-RENDER | — | — |
| `src/render/background.js` | — | GIMMICK-RENDER | — | — | FIX-RENDER | — | — |
| `src/render/icons.js` | — | — | ITEMS-P2 | — | FIX-RENDER | — | — |
| `src/scenes/index.js` | SKEL | — | — | HOOK-SWEEP | FIX-SCENES-A | — | — |
| `src/scenes/reg_town.js` | SKEL | — | — | — | FIX-SCENES-A | — | — |
| `src/scenes/stage.js` | — | PLAT-CORE | — | HOOK-SWEEP | FIX-SCENES-A | — | EXT-QAFIX |
| `src/scenes/overlays.js` | — | — | OVERLAYS | HOOK-SWEEP | FIX-SCENES-A | — | EXT-QAFIX |
| `src/scenes/dialogue.js` | — | — | PLAT-GAMES | — | FIX-SCENES-A | — | EXT-QAFIX |
| `src/scenes/results.js` | — | — | PLAT-GAMES | — | FIX-SCENES-A | — | — |
| `src/scenes/pause.js` | — | — | PLAT-GAMES | — | FIX-SCENES-A | — | — |
| `src/scenes/title.js` | — | — | PLAT-FRONT | — | FIX-SCENES-A | — | EXT-ACCOUNTS |
| `src/scenes/front/story.js` | — | — | STORY-P2-A | — | FIX-SCENES-A | — | EXT-QAFIX |
| `src/scenes/front/ending.js` | — | — | STORY-P2-A | — | FIX-SCENES-A | — | — |
| `src/scenes/front/options.js` | — | — | PLAT-OPTIONS | — | FIX-SCENES-A | — | — |
| `src/scenes/front/arcade.js` | — | — | PLAT-FRONT | — | FIX-SCENES-A | — | — |
| `src/scenes/front/slots.js` | — | — | PLAT-FRONT | — | FIX-SCENES-A | — | EXT-ACCOUNTS |
| `src/scenes/town/hub.js` | — | — | PLAT-TOWN | — | FIX-SCENES-B | — | EXT-QAFIX |
| `src/scenes/town/worldmap.js` | — | — | WORLDMAP-P2 | — | FIX-SCENES-B | — | — |
| `src/scenes/town/facades.js` | — | — | CMP-TOWN | — | FIX-SCENES-B | — | — |
| `src/scenes/menu/menu.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | — |
| `src/scenes/menu/common.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | — |
| `src/scenes/menu/hero_view.js` | — | — | PLAT-TURNTABLE | — | FIX-SCENES-B | — | — |
| `src/scenes/menu/tab_system.js` | — | — | PLAT-MENU | — | FIX-SCENES-B | — | EXT-ACCOUNTS |
| `src/data/story.js` | SKEL | — | STORY-P2-A | — | FIX-STORY | — | — |
| `src/data/stages.js` | SKEL | — | MAPS-P2-A (+ appends: MAPS-P2-B, MAPS-P2-C) | — | FIX-DATA | — | — |
| `src/data/items.js` | — | P2-DATA | ITEMS-P2 | — | FIX-DATA | — | — |
| `src/data/lore.js` | — | P2-DATA | ITEMS-P2 | — | FIX-DATA | — | — |
| `src/data/quests.js` | — | — | ITEMS-P2 | — | FIX-DATA | — | — |
| `src/data/town.js` | — | — | CMP-TOWN | — | FIX-DATA | — | EXT-QAFIX |
| `src/data/npcs.js` | — | — | CMP-TOWN | — | FIX-DATA | — | — |
| `src/data/music.js` | — | — | — | — | FIX-AUDIO-MUSIC | — | EXT-MUSIC-P2 |
| `src/data/enemies.js` | SKEL | — | — | — | FIX-DATA | — | — |
| `src/data/bosses.js` | SKEL | — | — | — | FIX-DATA | — | — |
| `index.html` | — | PLAT-CORE | — | — | FIX-PLATFORM | — | — |
| `css/style.css` | — | PLAT-CORE | — | — | FIX-PLATFORM | — | EXT-FONTS |
| `netlify.toml` | — | — | DELIVERY-WEB | — | FIX-DELIVERY | DELIVER-WEB | EXT-ACCOUNTS |
| `sw.js` | — | — | DELIVERY-WEB | — | FIX-DELIVERY | DELIVER-WEB | — |
| `package.json` | — | PLAT-QA | — | — | FIX-TOOLS | — | EXT-ACCOUNTS |
| `android/app/src/main/java/com/bloodnocturne/game/AssetServer.java` | — | — | — | APK-FU | FIX-DELIVERY | DELIVER-APK | EXT-APK |
| `tools/integration.mjs` | — | — | — | P2-QA | FIX-TOOLS | — | — |
| `tools/validate_maps.mjs` | — | GIMMICK-RENDER | — | — | FIX-TOOLS | — | — |
| `tools/balance.mjs` | — | — | — | P2-QA | FIX-TOOLS | — | — |
| `docs/ARCHITECTURE.md` | — | — | — | DOCS-ARCH | FIX-TOOLS | — | — |

---

## 5. Final integration and QA wave (W4) and delivery (W5)

### 5.1 Full regression suite

The full suite runs every round, in this order. A round that stops early still reports every failure found so far.

| kind | command |
|---|---|
| static | `node tools/validate_maps.mjs  (all 20 stages + arena, 0 errors)` |
| static | `node tools/test_part2.mjs --static` |
| static | `python3 tools/fonts/build_fonts.py --check  (every Hangul syllable in src/** covered)` |
| unit | `node tools/test_save_v2.mjs && node tools/test_settings_v2.mjs && node tools/test_companion_state.mjs && npm run test:api` |
| unit | `node tools/test_sfx.mjs && node tools/test_hud_layout.mjs` |
| balance | `for c in kael sera victor bran lia azel; do node tools/balance.mjs normal $c --check; done  (+ hard/inferno printed for review)` |
| balance | `node tools/balance_companions.mjs && node tools/scan_mount_fit.mjs` |
| runtime desktop | `node tools/integration.mjs  (all cases: title, hub, worldmap, inn, arcade, menu, s01–s20, s01_boss–s20_boss)` |
| runtime mobile | `node tools/integration.mjs --mobile` |
| runtime Part 2 | `node tools/test_part2.mjs  (tests 4–12 of world2 §17: every P2 room, 7 gimmicks, 7 bosses × patterns × phases, flow, legacy save, 5 endings, items/quests, boss loot, mobile)` |
| runtime feel | `node tools/feel_test.mjs  (M1–M6, C1–C15, U1–U2, A1–A8, V1 screenshots)` |
| runtime companions | `node tools/test_mount.mjs && node tools/test_guardians.mjs && node tools/test_companions.mjs  (C10 checklist 1–10)` |
| runtime platform | `node tools/qa/run_platform.mjs  (pad, touch, view, menu, turntable, load, pwa; ≤ 12 min)` |
| runtime commands | `node tools/qa/commands.mjs  (every technique d02–d26 by keyboard, pad sectors and touch)` |
| perf | `node tools/qa/perf_budget.mjs --profiles phone1,phone2,tablet,desk,fhd2x  (§5.2)` |
| soak | `node tools/qa/soak.mjs --minutes 10` |
| visual | `node tools/qa/visual_review.mjs  (contact sheets: every P2 room, 20 bosses × phases, 91 enemies, 20 companions, 6 heroes × 3 tiers × 8 yaws, 6 cut-ins at 960 and 1280, both ending cards, HUD matrix) — reviewed by opening the PNGs` |
| delivery | `node tools/deploy/build_web.mjs && node tools/deploy/serve_dist.mjs --check-load --offline` |
| delivery | `tools/apk/build_apk.sh --verify && node tools/apk/verify_apk.mjs` |
| post-deploy | `node tools/deploy/smoke_deployed.mjs https://<site>` |

### 5.2 Performance budgets (mobile settings first)

**Profiles:** **phone1** 844×390 DPR 3, touch, CPU ×4 throttle, quality 'auto' (starts medium) and forced 'low'; **phone2** 740×360 DPR 3, touch, CPU ×4, quality 'auto'; **tablet** 1024×768 DPR 2, touch, quality 'auto'; **desk** 1280×720 DPR 1, keyboard + fake pad, quality 'high'; **fhd2x** 1920×1080 DPR 2, quality 'high' (pixel budget check)

**Scenes measured:** stage s05 stress (12 enemies + bursts), s17 r1 (wind), s20 r1 (void wall), s16 r2 (deep), each Part 2 boss room, one ultimate and one awakening per hero (tier 2 class), hub with a mount + 2 guardians, menu equip tab (turntable), title cold load (slow 4G / fast 4G).

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
| creature art (TBD approach) | per-draw ≤ 1.5× today's renderer; painted: ≤ 15 MB textures per boss desktop, ≤ 6 MB phone | this plan §1.15 |
| memory | decoded-image LRU budget 160 MB touch / 400 MB desktop; canvases ≤ 20 MB at phone1 with the menu open | platform §6.7, §1.5 |
| load | slow 4G first frame ≤ 9 s, fast 4G ≤ 2.5 s (serve_dist.mjs, brotli); critical path ≤ 1.6 MB brotli; first-frame fonts ≤ 500 KB; dist/web ≤ 60 MB | platform §9.1, §8 |
| assets | bg ≤ 180 KB, cg ≤ 170 KB, P2 portraits ≤ 90 KB, companion portraits and cut-ins ≤ 250 KB, textures ≤ 60 KB, Part 2 total ≤ 6 MB | world2 §13.1, feel §6.6, companions §11.5 |
| APK | ≤ 20 MB | platform WP-9 |
| soak | 10-minute scripted soak (stage ↔ hub ↔ menu loops): JS heap and live canvas count stable (±10%), zero errors | this plan |

### 5.3 Loop-until-dry QA procedure

1. Round N starts with QA-ROUND: run the whole §5.1 matrix on a fresh server and write /tmp/claude-0/qa/round_<N>/defects.json: [{id, sev S1-S4, suite, repro (URL + steps or command), expected, actual, files[], bucket}] plus screenshots.
2. Severity: S1 crash, soft-lock, data loss, security or deploy exposure; S2 broken feature or wrong flow, console error, spec acceptance failure; S3 visual/audio defect, balance outside targets, perf budget miss; S4 polish (logged, fixed only if trivial).
3. Triage: dedupe against earlier rounds, map every defect to exactly one bucket by its primary file (bucket globs above partition every source file). Cross-bucket defects go to the bucket of the file where the fix belongs; follow-ups are ticketed for the next round.
4. Spawn at most one FIX-<bucket> agent per bucket that has S1-S3 defects (≤ 10 at a time). Each FIX agent edits only its bucket's files, re-runs the failing tests plus `node tools/integration.mjs` for its area, and reports fixed / not reproducible / needs another bucket.
5. Delivery defects (build_web, service worker, netlify.toml, APK, artifact page, font subsets) go to the FIX-DELIVERY bucket like any other bucket. The font coverage check fails until the Korean subsets are rebuilt from the final text, so FIX-DELIVERY rebuilds them in the first round.
6. The next round re-runs everything (not only the failed suites). The loop is dry when a full round reports zero S1-S3 defects and no source edit landed after the round started; that opens GATE:QA-DRY. Cap: 6 rounds; after that the lead decides which remaining S3 items become known issues.
7. W5 (delivery) starts only after GATE:QA-DRY. QA-SIGNOFF re-runs the smoke subset on the deployed site, the APK and the artifact; any S1/S2 found there reopens one W4 round for the owning bucket, then the affected W5 step repeats.

**Fix buckets** (their globs partition every source file, so two fix agents never share a file within a round)

| bucket | owns (globs) |
|---|---|
| FIX-ENGINE | `src/game/world.js`, `src/game/player.js`, `src/game/combat.js`, `src/game/enemy.js`, `src/game/impact.js`, `src/game/style.js`, `src/game/feel_move.js`, `src/game/awaken*.js`, `src/game/projectiles.js`, `src/game/pickups.js`, `src/game/props.js`, `src/game/tilemap.js`, `src/game/entity.js`, `src/game/stats.js`, `src/game/state.js`, `src/game/gimmicks*.js`, `src/core/camera.js`, `src/core/particles.js`, `src/core/physics.js`, `src/core/lighting.js`, `src/core/math.js`, `src/core/events.js`, `src/data/feel_move.js`, `src/data/feel_hit.js`, `src/data/awaken.js` |
| FIX-SYSTEMS | `src/game/skills.js`, `src/game/skills_p2.js`, `src/game/loot.js`, `src/game/quests.js`, `src/game/progression.js`, `src/game/inventory.js`, `src/game/enhance.js` |
| FIX-AI-BOSS | `src/game/ai*.js`, `src/game/bosses/**` |
| FIX-COMPANIONS | `src/game/companions.js`, `src/game/companion_state.js`, `src/game/companion_events.js`, `src/game/mount.js`, `src/game/guardian*.js`, `src/data/companions.js`, `src/data/story_companions.js`, `src/render/mount_rig.js`, `src/render/mounts*.js`, `src/render/guardians*.js`, `src/render/companion_hud.js`, `src/scenes/companion_join.js`, `src/scenes/menu/tab_companions.js`, `src/scenes/town/stable.js`, `src/core/audio_companions.js` |
| FIX-RENDER | `src/render/**`, `!src/render/mount_rig.js`, `!src/render/mounts*.js`, `!src/render/guardians*.js`, `!src/render/companion_hud.js`, `!src/render/hud.js`, `!src/render/hud_layout.js`, `!src/render/feel_hud.js` |
| FIX-HUD | `src/render/hud.js`, `src/render/hud_layout.js`, `src/render/feel_hud.js` |
| FIX-DATA | `src/data/**`, `!src/data/story.js`, `!src/data/story_p2.js`, `!src/data/story_p2b.js`, `!src/data/companions.js`, `!src/data/story_companions.js`, `!src/data/feel_move.js`, `!src/data/feel_hit.js`, `!src/data/awaken.js`, `!src/data/controls.js`, `!src/data/music.js` |
| FIX-STORY | `src/data/story.js`, `src/data/story_p2.js`, `src/data/story_p2b.js` |
| FIX-SCENES-A | `src/scenes/*.js`, `src/scenes/front/**`, `!src/scenes/companion_join.js`, `!src/scenes/front/account.js`, `!src/scenes/front/cloud_ui.js` |
| FIX-SCENES-B | `src/scenes/town/**`, `src/scenes/menu/**`, `src/scenes/games/**`, `!src/scenes/town/stable.js`, `!src/scenes/menu/tab_companions.js` |
| FIX-PLATFORM | `src/core/game.js`, `src/core/input.js`, `src/core/prompts.js`, `src/core/haptics.js`, `src/core/touchpad.js`, `src/core/platform.js`, `src/core/assets.js`, `src/core/save.js`, `src/core/ui.js`, `src/main.js`, `src/boot-gate.js`, `index.html`, `css/**`, `manifest.webmanifest`, `src/data/controls.js` |
| FIX-AUDIO-MUSIC | `src/core/audio.js`, `src/core/sfx_feel.js`, `src/data/music.js` |
| FIX-ACCOUNTS | `netlify/functions/**`, `netlify/lib/**`, `src/core/cloud.js`, `src/scenes/front/account.js`, `src/scenes/front/cloud_ui.js`, `tools/accounts/**`, `docs/ACCOUNTS.md` |
| FIX-TOOLS | `tools/**`, `package.json`, `docs/ARCHITECTURE.md`, `!tools/deploy/**`, `!tools/apk/**`, `!tools/artifact/**`, `!tools/fonts/**`, `!tools/kling/**`, `!tools/blender/**`, `!tools/painted/**`, `!tools/puppet/**`, `!tools/assets/make_variants.py`, `!tools/android/**`, `!tools/accounts/**` |
| FIX-ASSETS | `assets/**`, `tools/kling/**`, `tools/blender/**`, `tools/painted/**`, `tools/puppet/**`, `!assets/fonts/**`, `!assets/lo/**` |
| FIX-DELIVERY | `netlify.toml`, `sw.js`, `robots.txt`, `tools/deploy/**`, `tools/assets/make_variants.py`, `assets/lo/**`, `android/**`, `tools/apk/**`, `tools/artifact/**`, `assets/fonts/**`, `tools/fonts/**` |

### 5.4 Delivery steps (W5, after GATE:QA-DRY)

| step | package | action |
|---|---|---|
| 1 | DELIVER-WEB | Confirm python3 tools/fonts/build_fonts.py --check is green (it was part of the dry round; the subsets were rebuilt by FIX-DELIVERY) and first-frame fonts ≤ 500 KB. |
| 2 | DELIVER-WEB | node tools/deploy/build_web.mjs (regenerates assets/lo/ via make_variants.py first) → dist/web; deny check and size report must pass. |
| 3 | DELIVER-WEB | Create the Netlify site (Netlify connector/CLI) linked to this repo's build settings (publish dist/web, functions netlify/functions, Node 22); optional AUTH_PEPPER env; deploy with `netlify deploy --build --prod` (never --dir .). Verify GET /api/health → {ok:true, api:1}. |
| 4 | DELIVER-WEB | node tools/deploy/smoke_deployed.mjs https://<site>: headers (§9.2), SW registration, manifest installability, zero page errors on title/hub/stage, account signup/login/cloud save round trip on a throwaway id (then delete it). |
| 5 | DELIVER-APK | Write https://<site> into tools/apk/api_origin.txt; tools/apk/build_apk.sh --verify (WEB_FILES = dist/web minus sw.js and downloads/); aapt2 badging, apksigner v2/v3, zipalign, verify_apk.mjs with __BN_APP and __BN_INSETS 47/47/0/21; /api proxy check against the live site; ≤ 20 MB. |
| 6 | DELIVER-APK | Copy the APK to dist/web/downloads/BloodNocturne.apk and BloodNocturne-<versionName>-<versionCode>.apk; write latest.json {versionName, versionCode, sha256, bytes, url}. |
| 7 | DELIVER-WEB | Redeploy (same command) so /apk and /download resolve; smoke_deployed.mjs again (/apk → 302 → APK content type). |
| 8 | DELIVER-ARTIFACT | Republish the claude.ai artifact from tools/artifact/blood_nocturne.html with assets/fonts/*.woff2 + OFL.txt (and the game files it needs) in the files map; open it and confirm title → stage works, accounts hidden, zero errors. |
| 9 | DELIVER-HANDOFF | Send tools/android/release.keystore and keystore.properties to the user privately (file hand-off, never published/committed); write docs/RELEASE.md: site URL, APK URL and sha256, versionName/Code, rebuild steps, keystore backup instructions (no password). |
| 10 | QA-SIGNOFF | Re-run the smoke subset on the deployed site (desktop + phone emulation + fake pad), the APK (verify_apk) and the artifact; publish the release summary to the lead. |

### 5.5 Sign-off checklist (the user's 14 requests)

| request | packages | evidence |
|---|---|---|
| 1 more detailed 2D characters | ART-HERO-A, ART-HERO-B (approach TBD) | visual_review contact sheet (6 heroes × 3 tiers), tools/gallery_hero.html |
| 2 grotesque, boss-like bosses | ART-BOSS-1…5, BOSS-P2-1…4 (approach TBD) | visual_review (20 bosses × phases), integration boss rooms |
| 3 more volume: other worlds after chapter 13 | P2-DATA, GIMMICK-*, MAPS-P2-*, ENEMY-P2-*, BOSS-P2-*, STORY-P2-*, ITEMS-P2, WORLDMAP-P2, EXT-MUSIC-P2, EXT-P2-KLING/BLENDER | test_part2.mjs, validate_maps, balance --check |
| 4 mounts and guardians that ride/fight with you | CMP-DATA, CMP-SYS, CMP-GUARD-AI-B, CMP-MOUNT, CMP-*-ART, CMP-UI, CMP-TOWN, AUDIO-CMP, EXT-CMP-ART | test_companions.mjs, test_mount.mjs, test_guardians.mjs, balance_companions.mjs |
| 5 walking/running feel, arcade punch, DNF-style hits | FEEL-MOVE, FEEL-IMPACT, FEEL-REACT, FEEL-BOSSHOOKS, FEEL-HUD, AUDIO-FEEL | feel_test.mjs M1–M6, C1–C15 |
| 6 rotate the hero in the inventory (front/back) | PLAT-TURNTABLE, ART-HERO-B | tools/qa/turntable.mjs (acceptance 1–6) |
| 7 mobile touch that works well | PLAT-TOUCH, PLAT-CORE, PLAT-MENU, PLAT-FRONT, PLAT-OPTIONS, PLAT-TOWN, PLAT-GAMES | run_platform.mjs (touch, taps, safe area), integration --mobile |
| 8 controller support | PLAT-INPUT, prompts/glyphs in every UI package | platform_pad.mjs, pad-only walkthroughs |
| 9 blood-themed fonts | EXT-FONTS, FONTS-FU, bloodText call-site owners (§1.16), FIX-DELIVERY subset rebuild (W4) | build_fonts.py --check, visual review |
| 10 flashier impact and ultimates | FX-ULTKIT, FX-ULTS, OVERLAYS, FEEL-IMPACT | feel_test.mjs U1, U2, V1 |
| 11 true super ultimate with illustration and signature line | AWAKEN-CORE, AWAKEN-DIR-A/B, EXT-CUTIN-ART | feel_test.mjs A1–A8, V1 |
| 12 Netlify link and APK | DELIVERY-WEB, APK-FU, DELIVER-WEB, DELIVER-APK, DELIVER-HANDOFF | smoke_deployed.mjs, verify_apk.mjs |
| 13 optimized on mobile and desktop | PLAT-CORE, PLAT-SAVE-ASSETS, DELIVERY-WEB, PERF-MOBILE | perf_budget.mjs (§5.2), platform_load.mjs |
| 14 no errors (developer-level QA) | W4 QA loop, all harnesses | GATE:QA-DRY |
| kept: class change and equipment change the look | ART-HERO-A (must_keep) | visual_review, gallery_hero equipment rows |
| kept: arcade feel, 5 difficulty levels, saving, mobile play, no visual mismatch | all; save v2 + cloud (GAME-HOOKS, EXT-ACCOUNTS) | integration, test_save_v2, balance --check per difficulty, visual_review |

---

## 6. Open items for the lead

- GATE:ART-DECISION — creature approach (vector_hd vs painted) and hero puppet details (rig format, runtime file path, view set for the turntable).
- Kling credit budget for the painted approach (13 bosses, 67 + 24 enemies, 20 companions if painted) — set per ART package.
- Confirm the observed in-flight asset/music agents (EXT-CUTIN-ART, EXT-P2-KLING, EXT-P2-BLENDER, EXT-CMP-ART, EXT-MUSIC-P2) are running; otherwise spawn them from their external entries.
- Netlify account/team to create the site in; whether to connect Git builds or deploy from this container.
- Whether to normalize companion portrait file names (cmp_m_* → cmp_mt_*) after EXT-CMP-ART ends (optional, FIX-ASSETS in W4).
