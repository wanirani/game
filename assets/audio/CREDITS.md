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

## 고급 효과음 v2 / Premium SFX v2 (`assets/audio/sfx_v2/`)

게임 기본값 (끄기: `?sfx=v1` 또는 localStorage `bn.sfx`=`v1`, docs/specs/anime_motion_sfx.md §4·§5.1). 48종 (hit, hit_heavy, crit, hit_flesh, hit_stone, enemy_die, hurt, clang, ult_impact, step_stone, whip, whip_crack, slash, slash_heavy, dagger, axe, gun, jump, double_jump, land, dash, step_dirt, step_wood, step_metal, step_flesh, step_snow, step_water, menu_move, menu_ok, menu_cancel, type, coin, item, levelup, fire, ice, thunder, thunderclap, holy, dark, magic, explode, enemy_die_bone, enemy_die_ghost, enemy_die_stone, gallop, wing_flap, footstep) — 파일 189개 (.m4a 만).
모든 소리는 아래 **녹음 소재(전부 CC0 1.0)** 를 잘라 층으로 쌓고(순간음 + 몸통 + 꼬리) EQ·가벼운 새츄레이션·라우드니스(-16 LUFS)·클리퍼·리미터(≤ -1 dBFS)로 오프라인 가공한 2차 저작물이다 — 합성음 층 없음. 만드는 법: `tools/audio/sfx_v2/build_sfx_v2.py` + `recipes2.py` (레시피), 소재 받기: `tools/audio/sfx_v2/fetch_sources.py`, 파일별 출처 원본: `tools/audio/sfx_v2/sources.json`.
All v2 sounds are derivative works layered from the recordings below, every one released under **CC0 1.0** (public domain dedication — no attribution required, credited here anyway). No synthesized layers.

라이선스 근거 / Licence evidence:
- BigSoundBank.com (Joseph SARDIN): 사이트 전체 CC0 1.0 — https://bigsoundbank.com/droits.html
- Kenney "Impact Sounds"·"RPG Audio": 팩의 License.txt (CC0 1.0) — https://kenney.nl/assets/impact-sounds · https://kenney.nl/assets/rpg-audio
- OpenGameArt.org: 각 묶음 페이지의 License(s): CC0 (작가 본인 녹음/공개) — 아래 표의 페이지
- 쓰지 않은 것 / Rejected: freesound.org·sonniss.com (이 환경에서 접속 403), StarNinjas 묶음(원본이 클리핑), 출처가 불분명한 재업로드 묶음, CC0 가 아닌 파일(MIT/zlib 등), mp3 로만 받을 수 있는 BigSoundBank 소리(#0437·#0438 — 손실 원본), AI 생성 오디오


### Joseph SARDIN — BigSoundBank.com — CC0 1.0 (104)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Match #1 (#0004) | fire | https://bigsoundbank.com/match-1-s0004.html (https://bigsoundbank.com/UPLOAD/bwf-en/0004.wav) |
| Sword That Cuts (#0127) | hit | https://bigsoundbank.com/sword-that-cuts-s0127.html (https://bigsoundbank.com/UPLOAD/flac/0127.flac) |
| Sword Through the Air (#0128) | dagger, magic, slash | https://bigsoundbank.com/sword-through-the-air-s0128.html (https://bigsoundbank.com/UPLOAD/flac/0128.flac) |
| Electric shock (#0134) | thunder | https://bigsoundbank.com/electric-shock-s0134.html (https://bigsoundbank.com/UPLOAD/bwf-en/0134.wav) |
| Man Footsteps on the Wooden Floor (#0165) | step_wood | https://bigsoundbank.com/man-footsteps-on-the-wooden-floor-s0165.html (https://bigsoundbank.com/UPLOAD/bwf-en/0165.wav) |
| Heels #1 (#0166) | step_metal, step_stone | https://bigsoundbank.com/heels-s0166.html (https://bigsoundbank.com/UPLOAD/bwf-en/0166.wav) |
| Footstep in the Snow #1 (#0208) | step_snow | https://bigsoundbank.com/on-snow-s0208.html (https://bigsoundbank.com/UPLOAD/bwf-en/0208.wav) |
| Small Bell #1 (#0292) | holy, item, levelup | https://bigsoundbank.com/small-bell-1-s0292.html (https://bigsoundbank.com/UPLOAD/bwf-en/0292.wav) |
| Small bell #2 (#0293) | holy, item, levelup | https://bigsoundbank.com/small-bell-2-s0293.html (https://bigsoundbank.com/UPLOAD/bwf-en/0293.wav) |
| Small Bell #3 (#0294) | holy, item, levelup | https://bigsoundbank.com/small-bell-3-s0294.html (https://bigsoundbank.com/UPLOAD/bwf-en/0294.wav) |
| Switch #5 (#0321) | menu_move | https://bigsoundbank.com/switch-5-s0321.html (https://bigsoundbank.com/UPLOAD/bwf-en/0321.wav) |
| Coin in cup #1 (#0339) | coin | https://bigsoundbank.com/coin-in-cup-1-s0339.html (https://bigsoundbank.com/UPLOAD/bwf-en/0339.wav) |
| Coin in cup #2 (#0340) | coin | https://bigsoundbank.com/coin-in-cup-2-s0340.html (https://bigsoundbank.com/UPLOAD/bwf-en/0340.wav) |
| Heavy chain (#0359) | dark | https://bigsoundbank.com/heavy-chain-s0359.html (https://bigsoundbank.com/UPLOAD/bwf-en/0359.wav) |
| Medium Chain #1 (#0360) | dark | https://bigsoundbank.com/medium-chain-1-s0360.html (https://bigsoundbank.com/UPLOAD/bwf-en/0360.wav) |
| Shot of Winchester Magnum XTR (#0397) | gun | https://bigsoundbank.com/shot-of-winchester-magnum-xtr-s0397.html (https://bigsoundbank.com/UPLOAD/bwf-en/0397.wav) |
| Flight of a pigeon (#0476) | wing_flap | https://bigsoundbank.com/flight-of-a-pigeon-s0476.html (https://bigsoundbank.com/UPLOAD/bwf-en/0476.wav) |
| Steps in the Mud (#0495) | step_flesh | https://bigsoundbank.com/steps-in-the-mud-s0495.html (https://bigsoundbank.com/UPLOAD/bwf-en/0495.wav) |
| Whoosh #1 (#0572) | slash | https://bigsoundbank.com/whoosh-1-s0572.html (https://bigsoundbank.com/UPLOAD/bwf-en/0572.wav) |
| Whoosh #2 (#0573) | dark, double_jump, enemy_die_ghost, slash, slash_heavy | https://bigsoundbank.com/whoosh-2-s0573.html (https://bigsoundbank.com/UPLOAD/flac/0573.flac) |
| Bones cracking #1 (#0596) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/bones-cracking-s0596.html (https://bigsoundbank.com/UPLOAD/bwf-en/0596.wav) |
| Horse Gallop (#0611) | gallop | https://bigsoundbank.com/horse-gallop-s0611.html (https://bigsoundbank.com/UPLOAD/flac/0611.flac) |
| Punch #3 (#0806) | hurt | https://bigsoundbank.com/punches-3-s0806.html (https://bigsoundbank.com/UPLOAD/bwf-en/0806.wav) |
| Flight of a Pigeon (#0840) | wing_flap | https://bigsoundbank.com/flight-of-a-pigeon-s0840.html (https://bigsoundbank.com/UPLOAD/flac/0840.flac) |
| Glockenspiel (#0920) | levelup | https://bigsoundbank.com/glockenspiel-s0920.html (https://bigsoundbank.com/UPLOAD/bwf-en/0920.wav) |
| Big Branching Fire #1 (#0987) | fire | https://bigsoundbank.com/big-branching-fire-1-s0987.html (https://bigsoundbank.com/UPLOAD/flac/0987.flac) |
| Explosion far Away #1 (#1023) | ult_impact | https://bigsoundbank.com/explosion-far-away-s1023.html (https://bigsoundbank.com/UPLOAD/flac/1023.flac) |
| Typewriter #1 (#1065) | type | https://bigsoundbank.com/typewriter-1-s1065.html (https://bigsoundbank.com/UPLOAD/flac/1065.flac) |
| Shot of shovel (#1084) | clang, hurt | https://bigsoundbank.com/shot-shovel-s1084.html (https://bigsoundbank.com/UPLOAD/flac/1084.flac) |
| Sparkling Candle #1 (#1278) | enemy_die_ghost, magic | https://bigsoundbank.com/sparkling-candle-1-s1278.html (https://bigsoundbank.com/UPLOAD/flac/1278.flac) |
| Fast Steps on Concrete (#1318) | dash | https://bigsoundbank.com/fast-steps-on-concrete-s1318.html (https://bigsoundbank.com/UPLOAD/flac/1318.flac) |
| Cheers, small wineglass #1 (#1325) | holy, ice | https://bigsoundbank.com/cheers-small-wineglass-1-s1325.html (https://bigsoundbank.com/UPLOAD/flac/1325.flac) |
| Cheers, red wine glass #1 (#1328) | holy, ice | https://bigsoundbank.com/cheers-red-wine-glass-1-s1328.html (https://bigsoundbank.com/UPLOAD/flac/1328.flac) |
| Cheers, red wine glass #3 (#1330) | holy, ice | https://bigsoundbank.com/cheers-red-wine-glass-3-s1330.html (https://bigsoundbank.com/UPLOAD/flac/1330.flac) |
| Bones cracking #2 (#1408) | enemy_die_bone, hit_heavy | https://bigsoundbank.com/bones-cracking-2-s1408.html (https://bigsoundbank.com/UPLOAD/flac/1408.flac) |
| Bones cracking #3 (#1409) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/bones-cracking-3-s1409.html (https://bigsoundbank.com/UPLOAD/flac/1409.flac) |
| Gong, sweet (#1482) | holy, levelup | https://bigsoundbank.com/gong-sweet-s1482.html (https://bigsoundbank.com/UPLOAD/flac/1482.flac) |
| Gong, strong #1 (#1483) | dark | https://bigsoundbank.com/gong-strong-1-s1483.html (https://bigsoundbank.com/UPLOAD/flac/1483.flac) |
| Splash, Small #1 (#1529) | step_water | https://bigsoundbank.com/splash-small-1-s1529.html (https://bigsoundbank.com/UPLOAD/flac/1529.flac) |
| Splash, small #2 (#1530) | step_water | https://bigsoundbank.com/splash-small-2-s1530.html (https://bigsoundbank.com/UPLOAD/flac/1530.flac) |
| Splash, small #3 (#1531) | step_water | https://bigsoundbank.com/splash-small-3-s1531.html (https://bigsoundbank.com/UPLOAD/flac/1531.flac) |
| Splash, small #4 (#1532) | step_water | https://bigsoundbank.com/splash-small-4-s1532.html (https://bigsoundbank.com/UPLOAD/flac/1532.flac) |
| Gavel, 1 blow (#1588) | hit_stone | https://bigsoundbank.com/gavel-1-blow-s1588.html (https://bigsoundbank.com/UPLOAD/flac/1588.flac) |
| Whoosh #3 (#1795) | whip | https://bigsoundbank.com/whoosh-3-s1795.html (https://bigsoundbank.com/UPLOAD/flac/1795.flac) |
| Whoosh #4 (#1796) | whip | https://bigsoundbank.com/whoosh-4-s1796.html (https://bigsoundbank.com/UPLOAD/flac/1796.flac) |
| Whoosh #5 (#1797) | dagger, jump, magic, slash, whip_crack | https://bigsoundbank.com/whoosh-5-s1797.html (https://bigsoundbank.com/UPLOAD/flac/1797.flac) |
| Whoosh #10 (#1798) | axe, slash_heavy | https://bigsoundbank.com/whoosh-10-s1798.html (https://bigsoundbank.com/UPLOAD/flac/1798.flac) |
| Whoosh #6 (#1799) | axe, jump, slash_heavy | https://bigsoundbank.com/whoosh-6-s1799.html (https://bigsoundbank.com/UPLOAD/flac/1799.flac) |
| Whoosh #7 (#1800) | dash, slash_heavy | https://bigsoundbank.com/whoosh-7-s1800.html (https://bigsoundbank.com/UPLOAD/flac/1800.flac) |
| Whoosh #8 (#1801) | axe, dash, slash_heavy | https://bigsoundbank.com/whoosh-8-s1801.html (https://bigsoundbank.com/UPLOAD/flac/1801.flac) |
| Whoosh #9 (#1802) | dagger, jump, magic, whip_crack | https://bigsoundbank.com/whoosh-9-s1802.html (https://bigsoundbank.com/UPLOAD/flac/1802.flac) |
| Explosion far away #2 (#1806) | explode, ult_impact | https://bigsoundbank.com/explosion-far-away-2-s1806.html (https://bigsoundbank.com/UPLOAD/flac/1806.flac) |
| Explosion #1 (#1807) | explode, ult_impact | https://bigsoundbank.com/explosion-1-s1807.html (https://bigsoundbank.com/UPLOAD/flac/1807.flac) |
| Explosion #2 (#1808) | explode, ult_impact | https://bigsoundbank.com/explosion-2-s1808.html (https://bigsoundbank.com/UPLOAD/flac/1808.flac) |
| Jumping on concrete #1 (#1835) | land | https://bigsoundbank.com/jumping-on-concrete-1-s1835.html (https://bigsoundbank.com/UPLOAD/flac/1835.flac) |
| Jumping on Concrete #2 (#1836) | land | https://bigsoundbank.com/jumping-on-concrete-2-s1836.html (https://bigsoundbank.com/UPLOAD/flac/1836.flac) |
| Jumping on dirt road #1 (#1837) | land | https://bigsoundbank.com/jumping-on-dirt-road-1-s1837.html (https://bigsoundbank.com/UPLOAD/flac/1837.flac) |
| Jumping on dirt road #2 (#1838) | land | https://bigsoundbank.com/jumping-on-dirt-road-2-s1838.html (https://bigsoundbank.com/UPLOAD/flac/1838.flac) |
| Pistol, cocking #1 (#1984) | gun | https://bigsoundbank.com/pistol-cocking-1-s1984.html (https://bigsoundbank.com/UPLOAD/flac/1984.flac) |
| Pistol, cocking #2 (#1985) | gun | https://bigsoundbank.com/pistol-cocking-2-s1985.html (https://bigsoundbank.com/UPLOAD/flac/1985.flac) |
| Chimes "Dream" #1 (#2079) | holy, levelup | https://bigsoundbank.com/chimes-dream-1-s2079.html (https://bigsoundbank.com/UPLOAD/flac/2079.flac) |
| Chimes "dream" #2 (#2080) | enemy_die_ghost, item, magic, menu_ok | https://bigsoundbank.com/chimes-dream-2-s2080.html (https://bigsoundbank.com/UPLOAD/flac/2080.flac) |
| Chimes "dream" #3 (#2081) | enemy_die_ghost, item, magic, menu_ok | https://bigsoundbank.com/chimes-dream-3-s2081.html (https://bigsoundbank.com/UPLOAD/flac/2081.flac) |
| Chimes "dream" #4 (#2082) | enemy_die_ghost, holy, levelup | https://bigsoundbank.com/chimes-dream-4-s2082.html (https://bigsoundbank.com/UPLOAD/flac/2082.flac) |
| Chimes "dream" #5 (#2083) | enemy_die_ghost, item, menu_ok | https://bigsoundbank.com/chimes-dream-5-s2083.html (https://bigsoundbank.com/UPLOAD/flac/2083.flac) |
| Chimes "butterfly" #1 (#2087) | magic | https://bigsoundbank.com/chimes-butterfly-1-s2087.html (https://bigsoundbank.com/UPLOAD/flac/2087.flac) |
| Chimes "butterfly" #2 (#2088) | holy, levelup, magic | https://bigsoundbank.com/chimes-butterfly-2-s2088.html (https://bigsoundbank.com/UPLOAD/flac/2088.flac) |
| Ice cubes in a glass #1 (#2123) | ice | https://bigsoundbank.com/ice-cubes-in-a-glass-1-s2123.html (https://bigsoundbank.com/UPLOAD/flac/2123.flac) |
| Ice cubes in a glass #2 (#2124) | ice | https://bigsoundbank.com/ice-cubes-in-a-glass-2-s2124.html (https://bigsoundbank.com/UPLOAD/flac/2124.flac) |
| Ice cubes in a glass #3 (#2125) | ice | https://bigsoundbank.com/ice-cubes-in-a-glass-3-s2125.html (https://bigsoundbank.com/UPLOAD/flac/2125.flac) |
| Cracking ice #1 (#2205) | ice | https://bigsoundbank.com/cracking-ice-1-s2205.html (https://bigsoundbank.com/UPLOAD/flac/2205.flac) |
| Cracking ice #2 (#2206) | ice | https://bigsoundbank.com/cracking-ice-2-s2206.html (https://bigsoundbank.com/UPLOAD/flac/2206.flac) |
| Cracking ice #3 (#2207) | ice | https://bigsoundbank.com/cracking-ice-3-s2207.html (https://bigsoundbank.com/UPLOAD/flac/2207.flac) |
| Cracking ice #4 (#2208) | ice | https://bigsoundbank.com/cracking-ice-4-s2208.html (https://bigsoundbank.com/UPLOAD/flac/2208.flac) |
| Body Fall #1 (#2452) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/body-fall-1-s2452.html (https://bigsoundbank.com/UPLOAD/flac/2452.flac) |
| Body Fall #2 (#2453) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/body-fall-2-s2453.html (https://bigsoundbank.com/UPLOAD/flac/2453.flac) |
| Body fall #3 (#2454) | explode, ult_impact | https://bigsoundbank.com/body-fall-3-s2454.html (https://bigsoundbank.com/UPLOAD/flac/2454.flac) |
| Body fall #4 (#2455) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/body-fall-4-s2455.html (https://bigsoundbank.com/UPLOAD/flac/2455.flac) |
| Body fall #5 (#2456) | enemy_die, enemy_die_bone, hit_heavy | https://bigsoundbank.com/body-fall-5-s2456.html (https://bigsoundbank.com/UPLOAD/flac/2456.flac) |
| Punch #5 (#2460) | crit, enemy_die, hit, whip_crack | https://bigsoundbank.com/punch-5-s2460.html (https://bigsoundbank.com/UPLOAD/flac/2460.flac) |
| Punch #6 (#2461) | crit, enemy_die, hit, hit_heavy, whip_crack | https://bigsoundbank.com/punch-6-s2461.html (https://bigsoundbank.com/UPLOAD/flac/2461.flac) |
| Punch #8 (#2463) | crit, hit, hit_heavy, whip_crack | https://bigsoundbank.com/punch-8-s2463.html (https://bigsoundbank.com/UPLOAD/flac/2463.flac) |
| Punch #10 (#2465) | enemy_die, hit, hit_heavy, whip_crack | https://bigsoundbank.com/punch-10-s2465.html (https://bigsoundbank.com/UPLOAD/flac/2465.flac) |
| Punch #13 (#2468) | crit, enemy_die, hit, hit_heavy | https://bigsoundbank.com/punch-13-s2468.html (https://bigsoundbank.com/UPLOAD/flac/2468.flac) |
| Knife blade #1 (#2574) | dagger | https://bigsoundbank.com/knife-blade-1-s2574.html (https://bigsoundbank.com/UPLOAD/flac/2574.flac) |
| Knife blade #2 (#2575) | dagger | https://bigsoundbank.com/knife-blade-2-s2575.html (https://bigsoundbank.com/UPLOAD/flac/2575.flac) |
| Knife blade #3 (#2576) | dagger | https://bigsoundbank.com/knife-blade-3-s2576.html (https://bigsoundbank.com/UPLOAD/flac/2576.flac) |
| Knife blade #4 (#2577) | dagger | https://bigsoundbank.com/knife-blade-4-s2577.html (https://bigsoundbank.com/UPLOAD/flac/2577.flac) |
| Gore (zucchini) #1 (#2582) | enemy_die, hit, hit_flesh, step_flesh | https://bigsoundbank.com/gore-zucchini-1-s2582.html (https://bigsoundbank.com/UPLOAD/flac/2582.flac) |
| Gore (zucchini) #4 (#2585) | hit, hit_flesh, step_flesh | https://bigsoundbank.com/gore-zucchini-4-s2585.html (https://bigsoundbank.com/UPLOAD/flac/2585.flac) |
| Gore (zucchini) #5 (#2586) | hit, hit_flesh, step_flesh | https://bigsoundbank.com/gore-zucchini-5-s2586.html (https://bigsoundbank.com/UPLOAD/flac/2586.flac) |
| Gore (pepper) #1 (#2589) | enemy_die, hit, hit_flesh, step_flesh | https://bigsoundbank.com/gore-pepper-1-s2589.html (https://bigsoundbank.com/UPLOAD/flac/2589.flac) |
| Gore (pepper) #3 (#2591) | enemy_die, hit, hit_flesh, step_flesh | https://bigsoundbank.com/gore-pepper-3-s2591.html (https://bigsoundbank.com/UPLOAD/flac/2591.flac) |
| Gore (grapefruit) #5 (#2599) | enemy_die, hit_flesh | https://bigsoundbank.com/gore-grapefruit-5-s2599.html (https://bigsoundbank.com/UPLOAD/flac/2599.flac) |
| Thunder #1 (#2718) | thunderclap | https://bigsoundbank.com/thunder-s2718.html (https://bigsoundbank.com/UPLOAD/flac/2718.flac) |
| Rifle: Shot #1 (#2853) | gun | https://bigsoundbank.com/rifle-shot-1-s2853.html (https://bigsoundbank.com/UPLOAD/flac/2853.flac) |
| Rifle: Shot #2 (#2854) | gun | https://bigsoundbank.com/rifle-shot-2-s2854.html (https://bigsoundbank.com/UPLOAD/flac/2854.flac) |
| Whip crack #1 (#2949) | crit, thunder, thunderclap, whip, whip_crack | https://bigsoundbank.com/whip-crack-1-s2949.html (https://bigsoundbank.com/UPLOAD/flac/2949.flac) |
| Whip crack #2 (#2950) | thunder, thunderclap, whip, whip_crack | https://bigsoundbank.com/whip-crack-2-s2950.html (https://bigsoundbank.com/UPLOAD/flac/2950.flac) |
| Whip crack #3 (#2951) | thunder, whip, whip_crack | https://bigsoundbank.com/whip-crack-3-s2951.html (https://bigsoundbank.com/UPLOAD/flac/2951.flac) |
| Whip crack #4 (#2952) | thunder, thunderclap, whip, whip_crack | https://bigsoundbank.com/whip-crack-4-s2952.html (https://bigsoundbank.com/UPLOAD/flac/2952.flac) |
| Thunder #2 (#3113) | thunder, thunderclap | https://bigsoundbank.com/thunder-2-s3113.html (https://bigsoundbank.com/UPLOAD/flac/3113.flac) |
| Thunder #3 (#3114) | thunderclap | https://bigsoundbank.com/thunder-3-s3114.html (https://bigsoundbank.com/UPLOAD/flac/3114.flac) |
| Thunder #4 (#3115) | thunderclap | https://bigsoundbank.com/thunder-4-s3115.html (https://bigsoundbank.com/UPLOAD/flac/3115.flac) |

### Kenney (www.kenney.nl) — CC0 1.0 (72)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| footstep_concrete_000.ogg | gallop, jump, step_dirt, step_metal, step_snow, step_stone, step_water | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_000.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_001.ogg | gallop, jump, step_dirt, step_metal, step_snow, step_stone, step_water | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_001.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_002.ogg | gallop, jump, step_dirt, step_metal, step_snow, step_stone, step_water | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_002.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_003.ogg | gallop, jump, step_dirt, step_metal, step_snow, step_stone, step_water | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_003.ogg` in kenney_impact-sounds.zip) |
| footstep_concrete_004.ogg | step_dirt, step_metal, step_snow, step_stone, step_water | https://kenney.nl/assets/impact-sounds (`Audio/footstep_concrete_004.ogg` in kenney_impact-sounds.zip) |
| footstep_grass_000.ogg | step_dirt | https://kenney.nl/assets/impact-sounds (`Audio/footstep_grass_000.ogg` in kenney_impact-sounds.zip) |
| footstep_grass_001.ogg | step_dirt | https://kenney.nl/assets/impact-sounds (`Audio/footstep_grass_001.ogg` in kenney_impact-sounds.zip) |
| footstep_grass_002.ogg | step_dirt | https://kenney.nl/assets/impact-sounds (`Audio/footstep_grass_002.ogg` in kenney_impact-sounds.zip) |
| footstep_grass_003.ogg | step_dirt | https://kenney.nl/assets/impact-sounds (`Audio/footstep_grass_003.ogg` in kenney_impact-sounds.zip) |
| footstep_grass_004.ogg | step_dirt | https://kenney.nl/assets/impact-sounds (`Audio/footstep_grass_004.ogg` in kenney_impact-sounds.zip) |
| footstep_snow_000.ogg | step_snow | https://kenney.nl/assets/impact-sounds (`Audio/footstep_snow_000.ogg` in kenney_impact-sounds.zip) |
| footstep_snow_001.ogg | step_snow | https://kenney.nl/assets/impact-sounds (`Audio/footstep_snow_001.ogg` in kenney_impact-sounds.zip) |
| footstep_snow_002.ogg | step_snow | https://kenney.nl/assets/impact-sounds (`Audio/footstep_snow_002.ogg` in kenney_impact-sounds.zip) |
| footstep_snow_003.ogg | step_snow | https://kenney.nl/assets/impact-sounds (`Audio/footstep_snow_003.ogg` in kenney_impact-sounds.zip) |
| footstep_snow_004.ogg | step_snow | https://kenney.nl/assets/impact-sounds (`Audio/footstep_snow_004.ogg` in kenney_impact-sounds.zip) |
| footstep_wood_000.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/footstep_wood_000.ogg` in kenney_impact-sounds.zip) |
| footstep_wood_001.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/footstep_wood_001.ogg` in kenney_impact-sounds.zip) |
| footstep_wood_002.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/footstep_wood_002.ogg` in kenney_impact-sounds.zip) |
| footstep_wood_003.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/footstep_wood_003.ogg` in kenney_impact-sounds.zip) |
| footstep_wood_004.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/footstep_wood_004.ogg` in kenney_impact-sounds.zip) |
| impactMetal_heavy_000.ogg | enemy_die_stone | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_heavy_000.ogg` in kenney_impact-sounds.zip) |
| impactMetal_heavy_001.ogg | enemy_die_stone | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_heavy_001.ogg` in kenney_impact-sounds.zip) |
| impactMetal_heavy_002.ogg | enemy_die_stone | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_heavy_002.ogg` in kenney_impact-sounds.zip) |
| impactMetal_heavy_003.ogg | enemy_die_stone | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_heavy_003.ogg` in kenney_impact-sounds.zip) |
| impactMetal_light_000.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_light_000.ogg` in kenney_impact-sounds.zip) |
| impactMetal_light_001.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_light_001.ogg` in kenney_impact-sounds.zip) |
| impactMetal_light_002.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_light_002.ogg` in kenney_impact-sounds.zip) |
| impactMetal_light_003.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_light_003.ogg` in kenney_impact-sounds.zip) |
| impactMetal_light_004.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactMetal_light_004.ogg` in kenney_impact-sounds.zip) |
| impactPlate_light_000.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactPlate_light_000.ogg` in kenney_impact-sounds.zip) |
| impactPlate_light_001.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactPlate_light_001.ogg` in kenney_impact-sounds.zip) |
| impactPlate_light_002.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactPlate_light_002.ogg` in kenney_impact-sounds.zip) |
| impactPlate_light_003.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactPlate_light_003.ogg` in kenney_impact-sounds.zip) |
| impactPlate_light_004.ogg | step_metal | https://kenney.nl/assets/impact-sounds (`Audio/impactPlate_light_004.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_000.ogg | crit, gun, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_000.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_001.ogg | crit, gun, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_001.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_002.ogg | gun, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_002.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_003.ogg | crit, gun | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_003.ogg` in kenney_impact-sounds.zip) |
| impactPunch_heavy_004.ogg | crit, hit_heavy | https://kenney.nl/assets/impact-sounds (`Audio/impactPunch_heavy_004.ogg` in kenney_impact-sounds.zip) |
| impactSoft_medium_000.ogg | land, step_flesh | https://kenney.nl/assets/impact-sounds (`Audio/impactSoft_medium_000.ogg` in kenney_impact-sounds.zip) |
| impactSoft_medium_001.ogg | land, step_flesh | https://kenney.nl/assets/impact-sounds (`Audio/impactSoft_medium_001.ogg` in kenney_impact-sounds.zip) |
| impactSoft_medium_002.ogg | land, step_flesh | https://kenney.nl/assets/impact-sounds (`Audio/impactSoft_medium_002.ogg` in kenney_impact-sounds.zip) |
| impactSoft_medium_003.ogg | land, step_flesh | https://kenney.nl/assets/impact-sounds (`Audio/impactSoft_medium_003.ogg` in kenney_impact-sounds.zip) |
| impactSoft_medium_004.ogg | step_flesh | https://kenney.nl/assets/impact-sounds (`Audio/impactSoft_medium_004.ogg` in kenney_impact-sounds.zip) |
| impactWood_light_000.ogg | menu_move, step_wood, type | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_light_000.ogg` in kenney_impact-sounds.zip) |
| impactWood_light_001.ogg | menu_move, step_wood, type | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_light_001.ogg` in kenney_impact-sounds.zip) |
| impactWood_light_002.ogg | menu_move, step_wood, type | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_light_002.ogg` in kenney_impact-sounds.zip) |
| impactWood_light_003.ogg | menu_move, step_wood, type | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_light_003.ogg` in kenney_impact-sounds.zip) |
| impactWood_light_004.ogg | step_wood | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_light_004.ogg` in kenney_impact-sounds.zip) |
| impactWood_medium_000.ogg | menu_ok | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_medium_000.ogg` in kenney_impact-sounds.zip) |
| impactWood_medium_001.ogg | menu_ok | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_medium_001.ogg` in kenney_impact-sounds.zip) |
| impactWood_medium_002.ogg | menu_ok | https://kenney.nl/assets/impact-sounds (`Audio/impactWood_medium_002.ogg` in kenney_impact-sounds.zip) |
| beltHandle1.ogg | item | https://kenney.nl/assets/rpg-audio (`Audio/beltHandle1.ogg` in kenney_rpg-audio.zip) |
| bookClose.ogg | menu_cancel | https://kenney.nl/assets/rpg-audio (`Audio/bookClose.ogg` in kenney_rpg-audio.zip) |
| bookPlace1.ogg | menu_cancel | https://kenney.nl/assets/rpg-audio (`Audio/bookPlace1.ogg` in kenney_rpg-audio.zip) |
| bookPlace2.ogg | menu_cancel | https://kenney.nl/assets/rpg-audio (`Audio/bookPlace2.ogg` in kenney_rpg-audio.zip) |
| cloth1.ogg | dash, double_jump, jump, land, slash, wing_flap | https://kenney.nl/assets/rpg-audio (`Audio/cloth1.ogg` in kenney_rpg-audio.zip) |
| cloth2.ogg | dash, double_jump, jump, land, menu_cancel, slash, wing_flap | https://kenney.nl/assets/rpg-audio (`Audio/cloth2.ogg` in kenney_rpg-audio.zip) |
| cloth3.ogg | dash, double_jump, jump, land, menu_cancel, slash, wing_flap | https://kenney.nl/assets/rpg-audio (`Audio/cloth3.ogg` in kenney_rpg-audio.zip) |
| cloth4.ogg | dash, double_jump, jump, land, menu_cancel, slash, wing_flap | https://kenney.nl/assets/rpg-audio (`Audio/cloth4.ogg` in kenney_rpg-audio.zip) |
| clothBelt.ogg | double_jump | https://kenney.nl/assets/rpg-audio (`Audio/clothBelt.ogg` in kenney_rpg-audio.zip) |
| clothBelt2.ogg | double_jump | https://kenney.nl/assets/rpg-audio (`Audio/clothBelt2.ogg` in kenney_rpg-audio.zip) |
| drawKnife1.ogg | slash, slash_heavy | https://kenney.nl/assets/rpg-audio (`Audio/drawKnife1.ogg` in kenney_rpg-audio.zip) |
| drawKnife2.ogg | slash, slash_heavy | https://kenney.nl/assets/rpg-audio (`Audio/drawKnife2.ogg` in kenney_rpg-audio.zip) |
| drawKnife3.ogg | slash, slash_heavy | https://kenney.nl/assets/rpg-audio (`Audio/drawKnife3.ogg` in kenney_rpg-audio.zip) |
| handleCoins.ogg | coin | https://kenney.nl/assets/rpg-audio (`Audio/handleCoins.ogg` in kenney_rpg-audio.zip) |
| handleCoins2.ogg | coin | https://kenney.nl/assets/rpg-audio (`Audio/handleCoins2.ogg` in kenney_rpg-audio.zip) |
| handleSmallLeather.ogg | item | https://kenney.nl/assets/rpg-audio (`Audio/handleSmallLeather.ogg` in kenney_rpg-audio.zip) |
| handleSmallLeather2.ogg | item | https://kenney.nl/assets/rpg-audio (`Audio/handleSmallLeather2.ogg` in kenney_rpg-audio.zip) |
| knifeSlice.ogg | dagger | https://kenney.nl/assets/rpg-audio (`Audio/knifeSlice.ogg` in kenney_rpg-audio.zip) |
| knifeSlice2.ogg | dagger | https://kenney.nl/assets/rpg-audio (`Audio/knifeSlice2.ogg` in kenney_rpg-audio.zip) |
| metalLatch.ogg | menu_ok | https://kenney.nl/assets/rpg-audio (`Audio/metalLatch.ogg` in kenney_rpg-audio.zip) |

### rubberduck — CC0 1.0 (34)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| bfh1_metal_falling_01.ogg | enemy_die_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_metal_falling_01.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_metal_falling_02.ogg | enemy_die_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_metal_falling_02.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_metal_falling_03.ogg | enemy_die_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_metal_falling_03.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_metal_falling_04.ogg | enemy_die_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_metal_falling_04.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_breaking_01.ogg | enemy_die_stone, explode, ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_01.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_breaking_02.ogg | enemy_die_stone, explode, ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_02.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_breaking_03.ogg | enemy_die_stone, explode, ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_breaking_03.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_03.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_03.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_05.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_05.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_falling_07.ogg | ult_impact | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_falling_07.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_rock_hit_01.ogg | hit_stone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_rock_hit_01.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_wood_falling_01.ogg | enemy_die_bone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_wood_falling_01.ogg` in sfx_breaking_and_falling.zip) |
| bfh1_wood_falling_02.ogg | enemy_die_bone | https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx (`bfh1_wood_falling_02.ogg` in sfx_breaking_and_falling.zip) |
| chain_01.ogg | hurt, whip, whip_crack | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| chain_02.ogg | hurt, whip, whip_crack | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| chain_03.ogg | hurt, whip, whip_crack | https://opengameart.org/content/80-cc0-rpg-sfx (`chain_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_coins_01.ogg | coin | https://opengameart.org/content/80-cc0-rpg-sfx (`item_coins_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_coins_02.ogg | coin | https://opengameart.org/content/80-cc0-rpg-sfx (`item_coins_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_coins_03.ogg | coin | https://opengameart.org/content/80-cc0-rpg-sfx (`item_coins_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_coins_04.ogg | coin | https://opengameart.org/content/80-cc0-rpg-sfx (`item_coins_04.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_gem_01.ogg | item | https://opengameart.org/content/80-cc0-rpg-sfx (`item_gem_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_gem_02.ogg | item | https://opengameart.org/content/80-cc0-rpg-sfx (`item_gem_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_gem_03.ogg | item | https://opengameart.org/content/80-cc0-rpg-sfx (`item_gem_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_01.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_02.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_03.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_stone_04.ogg | hit_stone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_stone_04.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_wood_01.ogg | enemy_die_bone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_wood_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_wood_02.ogg | enemy_die_bone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_wood_02.ogg` in 80-CC0-RPG-SFX_0.zip) |
| item_wood_03.ogg | enemy_die_bone | https://opengameart.org/content/80-cc0-rpg-sfx (`item_wood_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| spell_fire_01.ogg | fire | https://opengameart.org/content/80-cc0-rpg-sfx (`spell_fire_01.ogg` in 80-CC0-RPG-SFX_0.zip) |
| spell_fire_03.ogg | fire | https://opengameart.org/content/80-cc0-rpg-sfx (`spell_fire_03.ogg` in 80-CC0-RPG-SFX_0.zip) |
| spell_fire_05.ogg | fire | https://opengameart.org/content/80-cc0-rpg-sfx (`spell_fire_05.ogg` in 80-CC0-RPG-SFX_0.zip) |
| spell_fire_07.ogg | fire | https://opengameart.org/content/80-cc0-rpg-sfx (`spell_fire_07.ogg` in 80-CC0-RPG-SFX_0.zip) |

### Fantozzi (freesound.org pack 10338, CC0) — 잘라 올림: qubodup — CC0 1.0 (10)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Fantozzi-SandL1.flac | step_dirt | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-SandL1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-SandL2.flac | step_dirt | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-SandL2.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-SandL3.flac | step_dirt | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-SandL3.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-SandR1.flac | step_dirt | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-SandR1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-SandR2.flac | step_dirt | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-SandR2.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneL1.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneL2.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL2.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneL3.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneL3.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneR1.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneR1.flac` in Fantozzi-footsteps.7z) |
| Fantozzi-StoneR2.flac | step_stone | https://opengameart.org/content/fantozzis-footsteps-grasssand-stone (`Fantozzi-footsteps/flac/Fantozzi-StoneR2.flac` in Fantozzi-footsteps.7z) |

### qubodup (Iwan Gabovitch) — CC0 1.0 (8)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| qubodupImpactMeat01.flac | hit, hit_flesh | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactMeat01.flac` in qubodupImpact.7z) |
| qubodupImpactMeat02.flac | hit, hit_flesh | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactMeat02.flac` in qubodupImpact.7z) |
| qubodupImpactStone.flac | hit_stone | https://opengameart.org/content/impact (`qubodupImpact/qubodupImpactStone.flac` in qubodupImpact.7z) |
| qubodupPunch01.flac | clang, crit, hit, hit_flesh, hit_heavy, slash_heavy | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch01.flac` in qubodupPunch.7z) |
| qubodupPunch02.flac | clang, hit, hit_flesh, hit_heavy, hurt, slash_heavy | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch02.flac` in qubodupPunch.7z) |
| qubodupPunch03.flac | clang, crit, hit, hit_flesh, hit_heavy, hurt, slash_heavy | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch03.flac` in qubodupPunch.7z) |
| qubodupPunch04.flac | clang, crit, hit, hit_flesh, hit_heavy, hurt, slash_heavy | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch04.flac` in qubodupPunch.7z) |
| qubodupPunch05.flac | clang, crit, hit, hurt | https://opengameart.org/content/punch (`qubodupPunch/qubodupPunch05.flac` in qubodupPunch.7z) |

### MedicineStorm (OGA) — Still North Media / Free Firearm Sound Library 팀 녹음, CC0 — CC0 1.0 (4)

| 소재 / Source | 쓰인 곳 / Used in | 원본 / Origin |
|---|---|---|
| Mace Norse Sword Blade.wav | crit | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Mace Norse Sword Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Norse Sword Katana Blade on Blade.wav | clang, crit, ult_impact | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Norse Sword Katana Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Sabre Katana Blade on Blade.wav | clang, crit, ult_impact | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Sabre Katana Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
| Sabre Norse Sword Blade on Blade.wav | clang | https://opengameart.org/content/medieval-sound-effects-weapon-impacts (`Sabre Norse Sword Blade on Blade.wav` in medieval_sfx_weapon_on_weapon_1_of_2.7z) |
