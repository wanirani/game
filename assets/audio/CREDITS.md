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
