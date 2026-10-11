# 오디오 크레딧 / Audio Credits

## 배경음악 / Music

**작곡 / Compositions** — 모든 배경음악(`assets/audio/music/*.m4a`, 44곡)은 이 게임을 위해 새로 쓴 오리지널 곡이다.
악보는 `src/data/music.js` 에 있고, 게임의 절차적 신스(`src/core/audio.js`)가 연주하던 것과 같은 음표·템포·편곡을
표준 MIDI 로 옮겨 샘플 음원으로 오프라인 렌더했다 (`tools/audio/music/build_music.mjs`, 설명: `tools/audio/music/README.md`).
All background music tracks are original compositions written for this game. The scores live in `src/data/music.js`;
the same notes, tempi and arrangements the in-game procedural synth plays were exported to standard MIDI and rendered
offline with a sampled General MIDI sound bank (`tools/audio/music/build_music.mjs`, see `tools/audio/music/README.md`).

**음원 / Sound bank** — *FluidR3_GM.sf2* by **Frank Wen** (with contributions credited in the SoundFont),
MIT License. 렌더러 / Renderer: FluidSynth (LGPL-2.1, 빌드 도구로만 사용 — 게임에 포함되지 않음 / build tool only, not shipped).
인코더 / Encoder: FFmpeg native AAC encoder (build tool only).

> FluidR3_GM.sf2 — Copyright (c) 2000-2002, 2008 Frank Wen. Released under the MIT License:
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice
> and this permission notice shall be included in all copies or substantial portions of the Software.
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

잔향은 게임 엔진의 '대성당' 임펄스 응답(`makeIR`)을 그대로 옮긴 컨볼루션이다 / The reverb is a convolution with a port
of the game engine's own cathedral impulse response (`makeIR`).


## 효과음 / SFX

녹음 효과음 샘플 (`assets/audio/sfx/`, 46종 · 파일 72개 · m4a + ogg 합계 약 0.86 MB). 모두 **Kenney (www.kenney.nl)** 의 CC0 1.0 (퍼블릭 도메인) 팩에서 골라
모노·앞뒤 무음 자르기·피크 −1 dBFS 로 다듬었다 (`tools/audio/sfx/build_sfx.py`, 음량은 `node tools/test_sfx.mjs --calibrate` 로 합성음에 맞춤).
출처 표기 의무는 없지만 감사의 뜻으로 적는다. 원본 라이선스 사본: `assets/audio/sfx/LICENSE-kenney.txt`.

| 팩 | 주소 | 라이선스 |
|---|---|---|
| Impact Sounds | https://kenney.nl/assets/impact-sounds | CC0 1.0 |
| RPG Audio | https://kenney.nl/assets/rpg-audio | CC0 1.0 |
| Interface Sounds | https://kenney.nl/assets/interface-sounds | CC0 1.0 |
| Sci-fi Sounds | https://kenney.nl/assets/sci-fi-sounds | CC0 1.0 |

효과음 이름 → 샘플 (팩/파일). 표에 없는 효과음은 합성음 그대로다 (src/core/audio.js · sfx_feel.js · audio_companions.js).

| 효과음 | 샘플 | 방식 |
|---|---|---|
| hit | impact-sounds/impactPunch_medium_000, impact-sounds/impactPunch_medium_001, impact-sounds/impactPunch_medium_002 | 샘플 + 합성 ×0.6 |
| hit_heavy | impact-sounds/impactPunch_heavy_000, impact-sounds/impactPunch_heavy_001, impact-sounds/impactPunch_heavy_002 | 샘플 + 합성 ×0.6 |
| crit | impact-sounds/impactPunch_heavy_003 | 샘플 + 합성 ×0.75 |
| hit_flesh | impact-sounds/impactSoft_heavy_000, impact-sounds/impactSoft_heavy_001 | 샘플 + 합성 ×0.5 |
| hit_bone | impact-sounds/impactWood_light_000, impact-sounds/impactWood_light_001 | 샘플 + 합성 ×0.5 |
| hit_stone | impact-sounds/impactMining_000, impact-sounds/impactMining_001 | 샘플 + 합성 ×0.5 |
| clang | impact-sounds/impactMetal_heavy_000, impact-sounds/impactMetal_heavy_001 | 샘플 + 합성 ×0.5 |
| counter | impact-sounds/impactMetal_medium_000 | 샘플 + 합성 ×0.7 |
| enhance_hit | impact-sounds/impactMetal_heavy_002 | 샘플 + 합성 ×0.6 |
| enemy_die | impact-sounds/impactSoft_heavy_002 | 샘플 + 합성 ×0.7 |
| hurt | impact-sounds/impactPunch_medium_003 | 샘플 + 합성 ×0.7 |
| wall_bounce | impact-sounds/impactPlank_medium_000 | 샘플 + 합성 ×0.6 |
| ground_bounce | impact-sounds/impactSoft_heavy_003 | 샘플 + 합성 ×0.6 |
| land | impact-sounds/impactSoft_medium_000, impact-sounds/impactSoft_medium_001 | 샘플 + 합성 ×0.5 |
| land_heavy | impact-sounds/impactSoft_heavy_004 | 샘플 + 합성 ×0.6 |
| explode | sci-fi-sounds/explosionCrunch_000, sci-fi-sounds/explosionCrunch_001 | 샘플 + 합성 ×0.6 |
| break_wall | impact-sounds/impactMining_002, impact-sounds/impactMining_003 | 샘플 + 합성 ×0.6 |
| boss_die | sci-fi-sounds/lowFrequency_explosion_000 | 샘플 + 합성 ×0.8 |
| ult_impact | sci-fi-sounds/lowFrequency_explosion_001 | 샘플 + 합성 ×0.7 |
| candle | impact-sounds/impactGlass_light_000, impact-sounds/impactGlass_light_001 | 샘플 + 합성 ×0.5 |
| bell | impact-sounds/impactBell_heavy_000 | 샘플 + 합성 ×0.7 |
| seal_stamp | impact-sounds/impactPlate_heavy_000 | 샘플 + 합성 ×0.6 |
| slash | rpg-audio/knifeSlice, rpg-audio/knifeSlice2 | 샘플 + 합성 ×0.5 |
| slash_heavy | rpg-audio/knifeSlice, rpg-audio/knifeSlice2 | 샘플 + 합성 ×0.6 · 속도 ×0.8 |
| dagger | rpg-audio/drawKnife1, rpg-audio/drawKnife2 | 샘플 + 합성 ×0.5 |
| sheath | rpg-audio/drawKnife3 | 샘플 + 합성 ×0.4 |
| axe | rpg-audio/chop | 샘플 + 합성 ×0.6 |
| footstep | rpg-audio/footstep00, rpg-audio/footstep01, rpg-audio/footstep02 | 샘플만 |
| step_stone | impact-sounds/footstep_concrete_000, impact-sounds/footstep_concrete_001, impact-sounds/footstep_concrete_002 | 샘플만 |
| step_dirt | impact-sounds/footstep_grass_000, impact-sounds/footstep_grass_001, impact-sounds/footstep_grass_002 | 샘플만 |
| step_wood | impact-sounds/footstep_wood_000, impact-sounds/footstep_wood_001, impact-sounds/footstep_wood_002 | 샘플만 |
| step_snow | impact-sounds/footstep_snow_000, impact-sounds/footstep_snow_001, impact-sounds/footstep_snow_002 | 샘플만 |
| jump | rpg-audio/cloth1 | 샘플 + 합성 ×0.7 |
| double_jump | rpg-audio/cloth2 | 샘플 + 합성 ×0.7 · 속도 ×1.1 |
| dash | rpg-audio/cloth3, rpg-audio/cloth4 | 샘플 + 합성 ×0.6 |
| coin | rpg-audio/handleCoins | 샘플 + 합성 ×0.8 |
| coin_insert | rpg-audio/handleCoins2 | 샘플 + 합성 ×0.7 |
| door | rpg-audio/doorOpen_1 | 샘플 + 합성 ×0.3 |
| chest | rpg-audio/creak1 | 샘플 + 합성 ×0.8 |
| heal | interface-sounds/glass_001 | 샘플 + 합성 ×0.8 |
| card | rpg-audio/bookFlip1, rpg-audio/bookFlip2, rpg-audio/bookFlip3 | 샘플만 |
| magic | sci-fi-sounds/forceField_000 | 샘플 + 합성 ×0.7 |
| clock_tick | interface-sounds/tick_004 | 샘플만 |
| menu_move | interface-sounds/tick_001 | 샘플 + 합성 ×0.5 |
| menu_ok | interface-sounds/confirmation_001 | 샘플 + 합성 ×0.4 |
| menu_cancel | interface-sounds/back_001 | 샘플 + 합성 ×0.4 |

## 고급 효과음 v2 시범 / Premium SFX v2 pilot (`assets/audio/sfx_v2/`)

스위치 `?sfx=v2` 또는 localStorage `bn.sfx`=`v2` 일 때만 쓰인다 (docs/specs/anime_motion_sfx.md §4·§5.1). 타격 10종 (hit, hit_heavy, crit, hit_flesh, hit_stone, enemy_die, hurt, clang, ult_impact, step_stone) × 변형 3~5개 = 파일 42개 (m4a·ogg 각각).
모든 소리는 아래 **녹음 소재(전부 CC0 1.0)** 를 잘라 층으로 쌓고(순간음 + 몸통 + 꼬리) EQ·가벼운 새츄레이션·라우드니스(-16 LUFS)·리미터(≤ -1 dBFS)로 오프라인 가공한 2차 저작물이다 — 합성음 층 없음. 만드는 법: `tools/audio/sfx_v2/build_sfx_v2.py` (레시피), 소재 받기: `tools/audio/sfx_v2/fetch_sources.py`, 파일별 출처 원본: `tools/audio/sfx_v2/sources.json`.
All v2 sounds are derivative works layered from the recordings below, every one released under **CC0 1.0** (public domain dedication — no attribution required, credited here anyway). No synthesized layers.

라이선스 근거 / Licence evidence:
- BigSoundBank.com (Joseph SARDIN): 사이트 전체 CC0 1.0 — https://bigsoundbank.com/droits.html
- Kenney "Impact Sounds": 팩의 License.txt (CC0 1.0) — https://kenney.nl/assets/impact-sounds
- OpenGameArt.org: 각 묶음 페이지의 License(s): CC0 (작가 본인 녹음/공개) — 아래 표의 페이지
- 쓰지 않은 것 / Rejected: freesound.org·sonniss.com (이 환경에서 접속 403), StarNinjas 묶음(원본이 클리핑), 출처가 불분명한 재업로드 묶음, CC0 가 아닌 파일(MIT/zlib 등) — 출처가 불명확한 소재는 쓰지 않는다.

### Joseph SARDIN — BigSoundBank.com — CC0 1.0 (32)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Sword That Cuts (#0127) | hit | https://bigsoundbank.com/sword-that-cuts-s0127.html (https://bigsoundbank.com/UPLOAD/flac/0127.flac) |
| Heels #1 (#0166) | step_stone | https://bigsoundbank.com/heels-s0166.html (https://bigsoundbank.com/UPLOAD/bwf-en/0166.wav) |
| Bones cracking #1 (#0596) | enemy_die, hit_heavy | https://bigsoundbank.com/bones-cracking-s0596.html (https://bigsoundbank.com/UPLOAD/bwf-en/0596.wav) |
| Punch #3 (#0806) | hurt | https://bigsoundbank.com/punches-3-s0806.html (https://bigsoundbank.com/UPLOAD/bwf-en/0806.wav) |
| Explosion far Away #1 (#1023) | ult_impact | https://bigsoundbank.com/explosion-far-away-s1023.html (https://bigsoundbank.com/UPLOAD/flac/1023.flac) |
| Shot of shovel (#1084) | clang, hurt | https://bigsoundbank.com/shot-shovel-s1084.html (https://bigsoundbank.com/UPLOAD/flac/1084.flac) |
| Bones cracking #2 (#1408) | hit_heavy | https://bigsoundbank.com/bones-cracking-2-s1408.html (https://bigsoundbank.com/UPLOAD/flac/1408.flac) |
| Bones cracking #3 (#1409) | enemy_die, hit_heavy | https://bigsoundbank.com/bones-cracking-3-s1409.html (https://bigsoundbank.com/UPLOAD/flac/1409.flac) |
| Gavel, 1 blow (#1588) | hit_stone | https://bigsoundbank.com/gavel-1-blow-s1588.html (https://bigsoundbank.com/UPLOAD/flac/1588.flac) |
| Raw carrot cut #1 (#1598) | hit_flesh | https://bigsoundbank.com/raw-carrot-cut-1-s1598.html (https://bigsoundbank.com/UPLOAD/flac/1598.flac) |
| Raw carrot cut #2 (#1599) | hit_flesh | https://bigsoundbank.com/raw-carrot-cut-2-s1599.html (https://bigsoundbank.com/UPLOAD/flac/1599.flac) |
| Raw carrot cut #3 (#1600) | hit_flesh | https://bigsoundbank.com/raw-carrot-cut-3-s1600.html (https://bigsoundbank.com/UPLOAD/flac/1600.flac) |
| Explosion far away #2 (#1806) | ult_impact | https://bigsoundbank.com/explosion-far-away-2-s1806.html (https://bigsoundbank.com/UPLOAD/flac/1806.flac) |
| Explosion #1 (#1807) | ult_impact | https://bigsoundbank.com/explosion-1-s1807.html (https://bigsoundbank.com/UPLOAD/flac/1807.flac) |
| Explosion #2 (#1808) | ult_impact | https://bigsoundbank.com/explosion-2-s1808.html (https://bigsoundbank.com/UPLOAD/flac/1808.flac) |
| Body Fall #1 (#2452) | enemy_die, hit_heavy | https://bigsoundbank.com/body-fall-1-s2452.html (https://bigsoundbank.com/UPLOAD/flac/2452.flac) |
| Body Fall #2 (#2453) | enemy_die, hit_heavy | https://bigsoundbank.com/body-fall-2-s2453.html (https://bigsoundbank.com/UPLOAD/flac/2453.flac) |
| Body fall #3 (#2454) | ult_impact | https://bigsoundbank.com/body-fall-3-s2454.html (https://bigsoundbank.com/UPLOAD/flac/2454.flac) |
| Body fall #4 (#2455) | enemy_die, hit_heavy | https://bigsoundbank.com/body-fall-4-s2455.html (https://bigsoundbank.com/UPLOAD/flac/2455.flac) |
| Body fall #5 (#2456) | enemy_die, hit_heavy | https://bigsoundbank.com/body-fall-5-s2456.html (https://bigsoundbank.com/UPLOAD/flac/2456.flac) |
| Punch #5 (#2460) | crit, enemy_die, hit | https://bigsoundbank.com/punch-5-s2460.html (https://bigsoundbank.com/UPLOAD/flac/2460.flac) |
| Punch #6 (#2461) | crit, enemy_die, hit, hit_heavy | https://bigsoundbank.com/punch-6-s2461.html (https://bigsoundbank.com/UPLOAD/flac/2461.flac) |
| Punch #8 (#2463) | crit, hit, hit_heavy | https://bigsoundbank.com/punch-8-s2463.html (https://bigsoundbank.com/UPLOAD/flac/2463.flac) |
| Punch #10 (#2465) | enemy_die, hit, hit_heavy | https://bigsoundbank.com/punch-10-s2465.html (https://bigsoundbank.com/UPLOAD/flac/2465.flac) |
| Punch #13 (#2468) | crit, enemy_die, hit, hit_heavy | https://bigsoundbank.com/punch-13-s2468.html (https://bigsoundbank.com/UPLOAD/flac/2468.flac) |
| Gore (zucchini) #1 (#2582) | enemy_die, hit, hit_flesh | https://bigsoundbank.com/gore-zucchini-1-s2582.html (https://bigsoundbank.com/UPLOAD/flac/2582.flac) |
| Gore (zucchini) #4 (#2585) | hit, hit_flesh | https://bigsoundbank.com/gore-zucchini-4-s2585.html (https://bigsoundbank.com/UPLOAD/flac/2585.flac) |
| Gore (zucchini) #5 (#2586) | hit, hit_flesh | https://bigsoundbank.com/gore-zucchini-5-s2586.html (https://bigsoundbank.com/UPLOAD/flac/2586.flac) |
| Gore (pepper) #1 (#2589) | enemy_die, hit, hit_flesh | https://bigsoundbank.com/gore-pepper-1-s2589.html (https://bigsoundbank.com/UPLOAD/flac/2589.flac) |
| Gore (pepper) #3 (#2591) | enemy_die, hit, hit_flesh | https://bigsoundbank.com/gore-pepper-3-s2591.html (https://bigsoundbank.com/UPLOAD/flac/2591.flac) |
| Gore (grapefruit) #5 (#2599) | enemy_die, hit_flesh | https://bigsoundbank.com/gore-grapefruit-5-s2599.html (https://bigsoundbank.com/UPLOAD/flac/2599.flac) |
| Whip crack #1 (#2949) | crit | https://bigsoundbank.com/whip-crack-1-s2949.html (https://bigsoundbank.com/UPLOAD/flac/2949.flac) |

### Kenney (www.kenney.nl) — CC0 1.0 (10)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| footstep_concrete_000.ogg | step_stone | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_000.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_001.ogg | step_stone | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_001.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_002.ogg | step_stone | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_002.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_003.ogg | step_stone | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_003.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_004.ogg | step_stone | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_004.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_000.ogg | crit, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_000.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_001.ogg | crit, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_001.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_002.ogg | hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_002.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_003.ogg | crit | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_003.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_004.ogg | crit, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_004.ogg` in kenney_impact-sounds.zip) |

### qubodup (Iwan Gabovitch) — CC0 1.0 (8)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| qubodupImpactMeat01.flac | hit, hit_flesh | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactMeat01.flac` in qubodupImpact.7z) |
| qubodupImpactMeat02.flac | hit, hit_flesh | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactMeat02.flac` in qubodupImpact.7z) |
| qubodupImpactStone.flac | hit_stone | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactStone.flac` in qubodupImpact.7z) |
| qubodupPunch01.flac | clang, crit, hit, hit_heavy | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch01.flac` in qubodupPunch.7z) |
| qubodupPunch02.flac | clang, hit, hit_heavy, hurt | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch02.flac` in qubodupPunch.7z) |
| qubodupPunch03.flac | clang, crit, hit, hit_heavy, hurt | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch03.flac` in qubodupPunch.7z) |
| qubodupPunch04.flac | clang, crit, hit, hit_heavy, hurt | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch04.flac` in qubodupPunch.7z) |
| qubodupPunch05.flac | clang, crit, hit, hurt | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch05.flac` in qubodupPunch.7z) |

### rubberduck — CC0 1.0 (14)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| bfh1_rock_breaking_01.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_01.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_breaking_02.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_02.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_breaking_03.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_03.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_03.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_03.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_05.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_05.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_07.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_07.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_hit_01.ogg | hit_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_hit_01.ogg` in sfx_breaking_and_falling.zip) |
| chain_01.ogg | hurt | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| chain_02.ogg | hurt | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| chain_03.ogg | hurt | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_01.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_02.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_03.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_04.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_04.ogg` in 80-CC0-RPG-SFX_0.zip) |

### MedicineStorm (OGA) — Still North Media / Free Firearm Sound Library 팀 녹음, CC0 — CC0 1.0 (4)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Mace Norse Sword Blade.wav | crit | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Mace Norse Sword Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Norse Sword Katana Blade on Blade.wav | clang, crit, ult_impact | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Norse Sword Katana Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Sabre Katana Blade on Blade.wav | clang, crit, ult_impact | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Sabre Katana Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Sabre Norse Sword Blade on Blade.wav | clang | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Sabre Norse Sword Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |

### Fantozzi (freesound.org pack 10338, CC0) — 잘라 올림: qubodup — CC0 1.0 (5)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Fantozzi-StoneL1.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneL2.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL2.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneL3.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL3.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneR1.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneR1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneR2.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneR2.flac` in Fantozzi-footsteps.7z) |
