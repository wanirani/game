# 블러드 녹턴 (BLOOD NOCTURNE) — 아키텍처 & 콘텐츠 계약서

2D 횡스크롤 고딕 액션(악마성 스타일) + 아케이드 요소. **순수 HTML5 Canvas + ES 모듈(빌드 없음)**. 데스크톱(키보드/게임패드)과 모바일(가상 패드) 모두 지원.

- 실행: `node tools/serve.mjs 8080` → `http://localhost:8080/`
- 바로 스테이지: `index.html?scene=stage&stage=s03&char=lia&room=r2&debug` (debug = 히트박스/FPS 표시)
- 스모크 테스트: `node tools/smoke.mjs --url "index.html?scene=stage&stage=s01" --out /tmp/claude-0/shots_x --steps "right:1,attack:0.2,shot"` → 콘솔 오류 목록 + 스크린샷 (Read 도구로 PNG 확인 가능)
  - `--steps` 토큰: `right|left|up|down|jump|attack|dash|sub|skill1|skill2|ult|menu|enter|swap[:초]`, `a+b:초`(동시), `wait:초`, `shot`, `eval=JS식`
  - `--mobile` : 844×390 터치 기기 에뮬레이션
- 맵 검증: `node tools/validate_maps.mjs [stageId]` (오류 0이어야 함)
- 안드로이드 APK: `tools/apk/build_apk.sh [--verify]` → `dist/BloodNocturne.apk` (Gradle 없이 aapt2·javac·d8·apksigner, SDK 자동 설치). 앱 셸은 `android/app/src/main/` (WebView가 `https://appassets.androidplatform.net/` 가상 출처로 APK `assets/www/` 제공, 뒤로=Escape, JS 브리지 `window.BNAndroid`, `html.bn-android`). 서명 키 `tools/android/`(git 무시, 백업 필수)

## 좌표/단위
- 논리 해상도: 높이 540 고정, 폭 960~1280 (`game.viewW`). 타일 `TILE = 48`.
- 엔티티 `x,y` = AABB 좌상단. 그리기 기준점은 **발 중앙 (cx, bottom)**. 오른쪽을 보는 상태로 그리고 `facing`(±1)으로 좌우 반전.
- 속도 px/s, 중력 2200 px/s², 시간 초. 고정 타임스텝 60Hz.
- 공격 판정 `box {x,y,w,h}` 는 **발 중앙 기준**, x 는 전방(+), y 는 위로 음수.

## 디렉터리와 소유권
| 경로 | 내용 |
|---|---|
| `src/core/*` | 엔진 코어 (game 루프/장면, input, camera, physics, particles, lighting, assets, save, ui, audio, math, events) |
| `src/game/*` | 런타임 (world, player, enemy, ai*, bosses/*, combat, projectiles, pickups, props, stats, inventory, enhance, loot, skills, progression, quests, state) |
| `src/render/*` | 절차적 렌더러 (hero, enemies*, bosses, icons, background, tiles, hud) |
| `src/data/*` | 순수 데이터 (characters, classes, skills, movesets, items, subweapons, powerups, enemies*, bosses*, stages, maps/*, story, quests, lore, npcs, shop, difficulty, music) |
| `src/scenes/*` | 화면 (title, stage, dialogue, overlays, results, pause, hub, menu, shop, …) — `scenes/index.js` 에 등록 |
| `assets/bg|portraits|tex` | Kling 생성 이미지(webp) | `assets/icons|props` | Blender 렌더(png) |
| `tools/` | serve, smoke, validate_maps, blender/*, kling/manifest.json |

**규칙**: 자기 담당 파일만 수정한다. 다른 파일의 버그를 발견하면 최소 수정만 하고 보고한다. npm 의존성 추가 금지. 순환 import 시 **모듈 최상위에서 import 값에 접근하지 말 것**(함수 안에서만). 모든 사용자 노출 텍스트는 자연스러운 한국어.

## 코어 API 요약
- `game` (`core/game.js`): `viewW/viewH`, `state`(세이브), `settings`, `meta`, `world`(현재 World), `go(name, params)`(스택 교체+페이드), `push(name, params)`(오버레이), `pop()`, `flash(color, a)`, `toast(text, color)` (장면별 줄 위치: `toastY/toastX/toastUp`, 숨김: `hideToasts`/`deferToasts`), `register(name, Class)`, `recordScore(score, stageId, mode)`.
- `Scene`: `enter(params)`, `exit()`, `update(dt)`, `render(ctx)`, `opaque`(false면 아래 장면도 그림), `onResume(result)`.
- `input` (`core/input.js`): 액션 `left right up down jump attack dash sub skill1 skill2 ult swap menu confirm cancel map`. `down(a) pressed(a) released(a) buffered(a, s) consume(a) axisX axisY command(seq, facing) pointer{ x,y,tapped,down } touchMode flush()`.
- `ui` (`core/ui.js`): `text(ctx,str,x,y,{size,color,align,weight,family,outline})`, `wrap`, `paragraph`, `panel`, `bar`, `button(ctx, rect, label, {selected})→tapped`, `ListMenu`(키보드+터치 목록), `drawCover`, `vignette`, `FONT{body,title,logo,num}`, `COLORS`, `RARITY_NAMES`.
- `audio`: `sfx(name,{vol,pitch})`, `music(id)`, `stopMusic(fade)`, `duck()`, `unlock()`.
- `assets.get('bg/s01_village')` → Image|null (null이면 절차적 대체 그림으로 그릴 것).
- `world.fx` (Particles): `emit/burst(type,x,y,n,{color,speed,angle,spread})` 타입 `spark hit blood dust smoke ember fire magic holy ice dark thunder shard soul gold water`, `ring`, `flash`, `slash`, `ghost(drawFn, life)`, `text(x,y,str,{color,size,crit})`.
- `world.camera.shake(mag, time)` (월드를 멈추는 오버레이는 `update` 에서 `camera.tickShake(dt)` 를 불러 흔들림을 제때 재생), `punchZoom(z, t)`; `world.lighting.add(x,y,r,color,i)` (엔티티의 `lights(L)`에서 호출); `world.hitstop = s`; `world.slowmo = s`; `world.timeStop`.
- `world`: `player, map, stage, room, run{hp,mp,hearts,lives,score,sp,sub,time,kills,...}, diff, state, hero, entities, time`; `add(e)`, `spawnEnemy(id, footX, footY, {params,facing,elite})`, `spawnProjectile(opts)`, `spawnPickup(type,x,y,data)`, `enemies()`, `nearestEnemy(x,y,max)`, `gainExp(n)`, `addScore(n)`, `applyPowerup(id)`, `playScript(id)`, `gotoRoom(id)`.
- 전투 (`game/combat.js`): `playerStrike(world, rect, attack)`, `enemyStrike(world, rect, attack)`, `hitTarget`. Attack 스키마는 파일 상단 주석. 대상은 `takeHit(dmg, attack, world, info)`와 `hurtbox()`, `stats{def,res,weak,resist}` 구현.
- 투사체 (`game/projectiles.js`): `Projectile` 옵션 `{x,y,vx,vy,w,h,team,owner,attack,life,behavior,render,color,pierce,spin,gravity,light,trail,onHit,onExpire,onLand,homingTurn,orbitR,...}` / `Hitbox` 지속 판정 / `explode(world,x,y,{r,attack})` / `PROJ_RENDER` 키: `orb bullet knife axe cross flask flame bone fireball bolt shard book wave none`.

## 능력치 키 (`game/stats.js` STAT_INFO)
`hp mp atk mag def res agi luck crit critDmg lifesteal hpRegen mpRegen moveSpd jumpPow airJumps atkSpd expBonus goldBonus dropBonus subDmg skillDmg cdr ultGain heartBonus fire ice holy dark thunder resFire resIce resHoly resDark resThunder dmgReduce reach magnet` (%류는 정수 %)

## 외형(look) 스키마 — `render/hero.js` 가 해석
캐릭터 기본 look ← 직업 look ← 장비 visual 순으로 덮어씀 (`composeLook`).
```
build:'slim'|'normal'|'broad'|'huge', height:0.9~1.15, skin, hair, hairStyle:'short'|'long'|'ponytail'|'spiky'|'bob'|'bald'|'braid'|'flowing',
eyes, eyeGlow, beard:null|'stubble'|'full', outfit:'hunter'|'nun'|'gunslinger'|'knight'|'ninja'|'noble'|'villager'|'priest'|'merchant'|'smith'|'innkeeper'|'girl'|'lady',
coat:'long'|'short'|'none'|'robe'|'dress', primary, secondary, trim, pants, boots,
headgear:null|'hood'|'hat'|'wide_hat'|'helm'|'circlet'|'crown'|'horns'|'veil'|'mask'|'tiara', headColor,
cape:null|{color,color2,len,style}, scarf:null|{color,long}, armor:null|'leather'|'chain'|'plate'|'holy'|'dark', armorColor, armorTrim,
wings:null|'bat'|'angel'|'bone'|'demon'|'crow'|'seraph', halo:bool, aura:null|{color,type:'holy'|'fire'|'dark'|'ice'|'blood'|'thunder'}, markings:null|'runes',
weapon:{type:'whip'|'sword'|'greatsword'|'dagger'|'gun'|'staff', style:1~6, color, glow, level(강화), rarity, element}
```
플레이어 애니메이션 이름(`p.anim`): `idle run jump fall flip land crouch dash wall hurt death throw cast charge` + 공격 포즈(`data/movesets.js` 의 anim): `lash lash_up lash_low lash_down spin launch down crouch_lash slash_down slash_up thrust slash_wide spin_blade uppercut plunge crouch_slash heavy_down heavy_up heavy_spin heavy_low stab stab_alt dive_kick crouch_stab shoot shoot_alt shoot_double shoot_up shoot_down crouch_shoot slide_shoot staff_swing staff_swing_up cast_up`.
진행도: `p.move`(현재 공격 데이터), `p.moveT`(경과초; 공격속도 배율 `p.atkSpeedMul` 적용 시 `t = moveT*atkSpeedMul`), 판정 구간 `move.hit=[s,e]`.

## 아이템
- 베이스 `ITEMS[id] = { id, name, slot:'weapon'|'head'|'body'|'cloak'|'acc'|'consumable'|'material'|'key', wtype?, tier(1~6), icon(아래 아이콘 ID), lvReq, stats:{}, visual:{}, element?, price, stack?, use?, desc, relic?, unique?, chars? }`
- 인스턴스 `{ uid, baseId, slot, icon, rarity(0~5), level(강화 0~15), affixes:[{id,stat,value}], qty }`
- 희귀도 0~5: 일반/고급/희귀/영웅/전설/신화.
- 아이콘 ID (Blender 렌더 `assets/icons/<id>.png`, 없으면 절차적): `whip_1~6 sword_1~6 greatsword_1~6 dagger_1~6 gun_1~6 staff_1~6 body_1~6 head_1~6 cloak_1~6 ring_1~6 amulet_1~6 potion_hp potion_mp potion_full elixir antidote meat bread stone_1~6 scroll_protect scroll_bless doc key relic_1~5 sub_dagger sub_axe sub_holywater sub_cross sub_stopwatch sub_pistol sub_bible sub_bomb heart_s heart_l coin moneybag gem_crystal oneup powerup`
- 필수 베이스 ID: 시작 무기 `w_whip_1 w_staff_1 w_gun_1 w_greatsword_1 w_dagger_1 w_sword_1`, 방어구 `a_body_1 a_body_2 a_body_3`, `c_potion`, 강화석 `m_stone_1~6`, `m_scroll_protect m_scroll_bless`, 유물 `k_relic_1~5`(relic:true).

## 적 로스터 (ID — 이름 — 콘셉트)
공용: `mimic` 미믹(보물상자 위장), `golden_bat` 황금 박쥐(보너스, 도망, 금화)
- s01 불타는 마을: `bat` 흡혈 박쥐, `zombie` 구울(땅에서 솟음), `skeleton` 해골 병사(검), `crow` 시체 까마귀(급강하), `wolf` 굶주린 늑대(돌진), `possessed` 빙의된 주민(쇠스랑)
- s02 안개의 묘지: `ghost` 원혼(벽 통과), `wisp` 도깨비불(탄), `bone_thrower` 뼈 던지는 해골, `gravedigger` 저주받은 무덤지기(삽, 대형), `mud_man` 진흙 인간
- s03 악마성 정문: `armor_knight` 방패 갑옷, `axe_armor` 도끼 갑옷(도끼 투척), `gargoyle` 가고일(비행·화염탄), `medusa_head` 메두사 머리(사인파), `medusa_spawner`(보이지 않는 생성기), `skeleton_archer` 해골 궁수
- s04 대회랑: `blood_skeleton` 피의 해골(부활), `phantom_sword` 유령 검(돌진), `lesser_demon` 하급 악마, `spear_guard` 창병 갑옷, `puppet_maiden` 저주 인형(도약)
- s05 지하 묘지: `bone_pillar` 해골 기둥(화염 포탑), `mummy` 미라, `skeleton_knight` 해골 기사, `corpse_worm` 시체 벌레, `bone_scimitar` 곡도 해골
- s06 대도서관: `book_fiend` 마도서 악령, `flea_man` 벼룩 사내, `skeleton_mage` 해골 마법사, `scholar_ghost` 학자 유령(순간이동), `ectoplasm` 엑토플라즘
- s07 연금술 연구소: `slime` 연금 슬라임, `homunculus` 호문쿨루스, `flesh_golem` 육체 골렘, `plague_doctor` 역병 의사(플라스크 투척), `acid_turret` 산성 증류기
- s08 지하 수로: `merman` 어인, `killer_fish` 살인 물고기, `frog_demon` 마계 개구리, `drowned` 익사체, `water_spirit` 물의 정령
- s09 시계탑: `gear_golem` 톱니 골렘, `harpy` 하피(깃털탄), `clockwork_soldier` 태엽 병사(총), `cog_wheel` 굴러오는 톱니
- s10 얼어붙은 첨탑: `ice_golem` 얼음 골렘, `frost_wraith` 서리 망령, `snow_wolf` 설원 늑대, `frozen_knight` 얼어붙은 기사, `ice_bat` 얼음 박쥐
- s11 피의 예배당: `succubus` 서큐버스, `blood_priest` 피의 사제, `bone_angel` 뼈 천사, `death_knight` 죽음의 기사, `cursed_nun` 저주받은 수녀
- s12 드라큘라의 왕좌: `vampire_bride` 흡혈 신부, `demon_lord` 마족 영주, `bat_swarm` 박쥐 떼, `royal_guard` 근위 갑옷
- s13 심연의 역성: `chaos_spawn` 혼돈의 권속, `hellhound` 지옥견, `abyss_eye` 심연의 눈(광선), `shadow_hunter` 그림자 헌터, `void_demon` 공허의 악마
적 A 담당: 공용 + s01~s06 / 적 B 담당: s07~s13.

## 보스 (ID — 스테이지)
`b_nightwing`(s01) 나이트윙 · `b_banshee`(s02) 밴시 여왕 · `b_dullahan`(s03) 둘라한 · `b_crimson`(s04) 진홍의 갑주군주 · `b_bonedragon`(s05) 본 드래곤 · `b_grimoire`(s06) 그리모어 · `b_chimera`(s07) 키메라 호문쿨루스 · `b_leviathan`(s08) 레비아탄 · `b_colossus`(s09) 태엽 거신 · `b_frostqueen`(s10) 서리 여왕 이자벨라 · `b_death`(s11) 사신 데스 · `b_dracula`(s12) 드라큘라 백작 (2페이즈에서 진정한 모습 `portraits/b_dracula2`로 변신) · `b_chaos`(s13) 혼돈의 군주.
초상화: `portraits/<bossId>` (드라큘라 변신: `portraits/b_dracula2`).

## 숨겨진 비전서(기술 문서) — `data/lore.js` DOCS
벽 'H' 를 부수면 해당 스테이지 `docs` 목록 순서로 등장. `tech` 는 커맨드 입력 기술(`game/skills.js` 의 `SKILL_IMPL[tech.id]` 구현), `stats` 는 영구 보너스.
| id | 스테이지 | 이름 | 효과 |
|---|---|---|---|
| d01 | s01 | 비전서: 질풍보 | stats {agi:3, moveSpd:5} |
| d02 | s01 | 비전서: 파동참 | tech_hadou ↓↘→+공격 (전방 검기) |
| d03 | s02 | 비전서: 승천격 | tech_shoryu →↓↘+공격 (무적 상승 베기) |
| d04 | s02 | 비전서: 영혼 수확 | stats {lifesteal:1} |
| d05 | s03 | 비전서: 선풍각 | tech_tatsu ↓↙←+공격 (회전 돌진) |
| d06 | s03 | 비전서: 철벽 | stats {def:5, hp:30} |
| d07 | s04 | 비전서: 백보신권 | tech_palm ←→+공격 (원거리 장풍) |
| d08 | s04 | 비전서: 흡마술 | stats {mpRegen:1, mp:20} |
| d09 | s05 | 비전서: 지옥참 | tech_hellslash ↓↓+공격 (지면 분출) |
| d10 | s05 | 비전서: 사자의 가호 | stats {resDark:15} |
| d11 | s06 | 비전서: 천뢰 | tech_thunder ↓↑+공격 (낙뢰) |
| d12 | s06 | 비전서: 현자의 눈 | stats {expBonus:10, luck:5} |
| d13 | s07 | 비전서: 연금 폭쇄 | tech_bomb ←↓→+공격 (폭탄 투척) |
| d14 | s08 | 비전서: 수룡참 | tech_hydro →→+공격 (물의 용 돌진) |
| d15 | s09 | 비전서: 시간 가속 | stats {atkSpd:8, cdr:5} |
| d16 | s09 | 비전서: 환영 분신 | tech_clone ←↙↓↘→+공격 (분신 공격) |
| d17 | s10 | 비전서: 절대영도 | tech_freeze ↑↓+공격 (빙결 폭발) |
| d18 | s11 | 비전서: 성흔 | stats {holy:15, resHoly:10} |
| d19 | s12 | 비전서: 진·그랜드 크로스 | tech_grandcross →↓←↑+공격 (MP 50, 화면 전체 십자 성광) |
| d20 | s13 | 비전서: 혈맥 각성 | stats {atk:10, mag:10, crit:5} |
커맨드 표기: `['d','df','f','btn:attack']` (f=전방, b=후방; facing 기준).

## 드라큘라의 유물 (진엔딩 조건)
`k_relic_1` 흡혈귀의 송곳니(s03) · `k_relic_2` 드라큘라의 늑골(s05) · `k_relic_3` 검은 심장(s07) · `k_relic_4` 불멸의 눈(s09) · `k_relic_5` 피의 반지(s11). 맵에서 `'@'` + `items:['k_relic_1']` 로 숨겨진 방에 배치. 5개 + 드라큘라 처치 → s13 해금.

## NPC
`npc_marta` 마르타(흑묘 여관 주인, 미니게임), `npc_rook` 로크(떠돌이 상인, 상점), `npc_hadwin` 하드윈(대장장이, 강화), `npc_alberto` 알베르토 신부(성당, 전직/스토리 멘토), `npc_elise` 엘리제(마을 소녀, 구출 퀘스트), `npc_carmilla` 카밀라(수수께끼의 흡혈귀 귀부인, 선택지→엔딩 분기). 초상화 `portraits/<id>`.

## 스토리 스크립트 ID 규칙
`<stageId>_intro`(스테이지 시작 전), `<stageId>_outro`(클리어 후), `<bossId>_pre`(보스 등장 전 대사), `<bossId>_post`, `prologue`, `ending_bad`, `ending_normal`, `ending_true`, `<npcId>_default`, `<npcId>_ch<N>`, 퀘스트 `q_<id>_start|_done`.

## 스토리 CG (Kling 생성, `assets/cg/<id>.webp`)
대사 스크립트에서 `{ cmd:'cg', id:'cg_prologue_moon' }` 로 전체화면 이벤트 CG 표시, `{ cmd:'cg', id:null }` 로 해제.
`cg_prologue_moon`(핏빛 달과 성의 출현) `cg_prologue_attack`(마을 습격) `cg_elise_taken`(엘리제 납치) `cg_alberto_church`(신부가 성물 전달) `cg_castle_gate`(성문 진입) `cg_carmilla_library`(도서관의 카밀라) `cg_elise_rescued`(엘리제 구출) `cg_death_appears`(사신 등장) `cg_dracula_throne`(왕좌의 드라큘라) `cg_dracula_transform`(악마 변신) `cg_castle_collapse`(성 붕괴·여명) `cg_abyss_gate`(심연의 문) `cg_true_ending`(진엔딩·여섯 영웅) `cg_bad_ending`(배드엔딩)

## 음악 트랙 ID
`title prologue hub inn shop smith church worldmap s01 … s13 arena boss boss2 dracula chaos victory gameover ending credits minigame story sad`

## 효과음 이름
`whip whip_crack slash slash_heavy gun shotgun magic holy fire ice thunder dark hit hit_heavy crit clang enemy_die explode jump double_jump land dash mist hurt death heart coin item powerup levelup menu_move menu_ok menu_cancel door candle break_wall secret save heal chest boss_roar boss_die warning thunderclap stopwatch cross axe dagger holywater_burn enhance_hit enhance_success enhance_fail enhance_destroy dice card slot_spin slot_win win lose ult combo footstep splash bat ghost bell clock_tick ready go coin_insert extra_life type charge_ready`

## 장면(Scene) 이름
`title slots difficulty charselect story(컷신: {script, then, bg}) stage dialogue bossIntro ultCutin document gameover results pause menu options hub worldmap shop smith church inn minigame_dice minigame_blackjack minigame_slot minigame_duel minigame_memory ending credits arcade highscore account cloudConflict`
(`account` = 계정·클라우드 저장 화면, `cloudConflict` = 클라우드 기록 받기/올리기 선택 — 계정 기능 전체는 `docs/ACCOUNTS.md`)

## 이벤트 버스 (`core/events.js`)
`enemyKilled bossKilled itemPicked goldPicked docFound relicFound secretFound stageCleared stageEntered roomEntered playerHurt playerDied levelUp classChanged enhance minigame npcTalk questDone combo`
계정(`core/cloud.js`): `cloud:status {state}` `cloud:login {id, resumed}` `cloud:logout {id, reason}` `cloud:sync {phase:'start'|'done', …}` `cloud:conflict {slot}`
