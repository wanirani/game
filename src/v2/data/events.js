// Event sequences of the first release, in the order of GDD 9.1 (the minute table).
// Shape and step vocabulary: docs/v2/DATA_FORMAT.md section 4. `waiting` = the area or hook is not built yet (section 12).
// A bridge sequence (`bridge: true`) plays the waiting scenes as text where the built world ends, so the game runs from the first minute to the end today.

const BELL = { event: 'bell.ring' };

export const EVENTS = [
  // ═════════ 0–5 오늘 밤, 마을 외곽 ═════════
  { id: 'ev_opening', minute: '0-5', on: 'area.enter', match: { area: 'eshville_now' }, if: ['!fell'], steps: [
    ['banner', 'area', '서막 — 금 간 종', '붉은 달이 뜨는 밤'],
    ['camera', 'moon_bell', 3],
    ['say', 'open.moon'],
    ['camera', null],
    ['objective', 'follow_bell'],
    ['prompt', 'move'],
  ] },
  { id: 'ev_first_bell', minute: '0-5', on: 'trigger', match: { event: 'bell.toll' }, steps: [
    ['sound', 'bell.toll'],
    ['say', 'open.bell'],
    ['prompt', 'attack'],
  ] },
  { id: 'ev_out_a_clear', minute: '0-5', on: 'group.clear', match: { group: 'out_a' }, if: ['era:now'], steps: [
    ['prompt', 'lock'],
  ] },

  // ═════════ 5–12 큰길과 광장 ═════════
  { id: 'ev_street_enter', minute: '5-12', on: 'trigger', match: { event: 'tutorial.guard' }, steps: [
    ['prompt', 'roll'],
  ] },
  { id: 'ev_street_knock', minute: '5-12', on: 'group.clear', match: { group: 'st_a' }, if: ['era:now', '!door_pulled'], steps: [
    ['say', 'street.knock'],
    ['prompt', 'coil'],
  ] },
  { id: 'ev_door_pull', minute: '5-12', on: 'interact', match: { event: 'door.pull' }, steps: [
    ['setFlag', 'door_pulled'],
    ['prompt', null],
    ['say', 'trapped.freed'],
  ] },
  { id: 'ev_street_clear_now', minute: '5-12', on: 'group.clear', match: { group: 'st_b' }, if: ['era:now'], steps: [
    ['setFlag', 'street_clear'],
    ['objective', 'to_square'],
  ] },
  { id: 'ev_square_enter_now', minute: '5-12', on: 'trigger', match: { event: 'square.enter' }, if: ['era:now', '!square_clear'], steps: [
    ['prompt', 'guard'],
  ] },
  { id: 'ev_square_clear', minute: '5-12', on: 'group.clear', match: { group: 'sq' }, if: ['era:now'], steps: [
    ['setFlag', 'square_clear'],
    ['setFlag', 'street_clear'],
    ['prompt', null],
    ['say', 'sera.square.first'],
    ['objective', 'to_church'],
    ['save'],
  ] },
  { id: 'ev_rook_shop', minute: '5-12', on: 'interact', match: { event: 'shop.rook' }, once: false, steps: [
    ['say', 'rook.shop'],
  ] },
  { id: 'ev_well', minute: '5-12', on: 'interact', match: { event: 'sign.well' }, once: false, steps: [
    ['say', 'sign.well'],
  ] },
  { id: 'ev_inn_door', minute: '5-12', on: 'interact', match: { event: 'door.inn' }, once: false, steps: [
    ['say', 'door.inn'],
  ] },
  { id: 'ev_tavern_door', minute: '20-26', on: 'interact', match: { event: 'door.tavern' }, once: false, steps: [
    ['say', 'door.inn'],
  ] },

  // ═════════ 12–15 성당 ═════════
  { id: 'ev_church_arrive', minute: '12-15', on: 'trigger', match: { event: 'church.arrive' }, if: ['era:now', '!promise'], steps: [
    ['prompt', null],
    ['say', 'church.meet'],
    ['setFlag', 'promise'],
    ['hideActor', 'elise', 'eshville_now'],
    ['unlockExit', 'to_belltower', 'eshville_now'],
    ['prompt', 'rest'],
    ['objective', 'climb_tower'],
    ['save'],
  ] },
  // the bread before the boss door comes first so that it plays before the candles are relit
  { id: 'ev_boss_rest', minute: '100-104', on: 'interact', match: { event: 'rest', id: 'boss_rest' }, if: ['has:lotte_bread'], steps: [
    ['say', 'oss.rest'],
    ['take', 'lotte_bread'],
  ] },
  { id: 'ev_rest', minute: '12-15', on: 'interact', match: { event: 'rest' }, once: false, steps: [
    ['prompt', null],
    ['candle', 0],
    ['toast', '촛불을 다시 밝혔다', 'info'],
    ['save'],
  ] },
  { id: 'ev_bell_now_before', minute: '12-15', on: 'interact', match: BELL, if: ['era:now', '!fell'], once: false, steps: [
    ['say', 'bell.now.before'],
  ] },

  // ═════════ 15–20 종탑 ═════════
  { id: 'ev_tower_enter', minute: '15-20', on: 'area.enter', match: { area: 'belltower_now' }, if: ['promise', '!fell'], steps: [
    ['say', 'tower.enter'],
    ['prompt', 'jump'],
    ['objective', 'climb_tower'],
  ] },
  { id: 'ev_tower_top', minute: '15-20', on: 'trigger', match: { event: 'tower.top' }, if: ['promise', '!fell'], steps: [
    ['prompt', null],
    ['say', 'tower.top'],
    ['wakeGroup', 'tower_bats'],
    ['objective', 'guard_elise'],
  ] },
  { id: 'ev_tower_crack', minute: '15-20', on: 'group.clear', match: { group: 'tower_bats' }, if: ['promise', '!fell'], steps: [
    ['camera', 'bell_crack', 2],
    ['sound', 'bell.crack'],
    ['say', 'tower.crack'],
    ['camera', 'fall', 3],
    ['give', 'bell_shard'],
    ['setFlag', 'fell'],
    ['clearFlag', 'street_clear'],
    ['hideActor', 'elise', 'eshville_now'],
    ['chronicle', 'bell_cracked'],
    ['objective', null],
    ['gotoArea', 'eshville_past', 'from_belltower'],
  ] },
  // the tower door while it is still locked (before the promise)
  { id: 'ev_tower_locked', minute: '15-20', on: 'exit.locked', match: { id: 'to_belltower' }, if: ['era:now', '!fell'], once: false, steps: [
    ['say', 'tower.door'],
  ] },

  // ═════════ 20–26 그 밤, 종탑 아래와 마을 ═════════
  { id: 'ev_past_wake', minute: '20-26', on: 'area.enter', match: { area: 'eshville_past' }, if: ['fell'], steps: [
    ['banner', 'area', '1장 — 백 년 전의 식탁', '그 밤의 사람들'],
    ['camera', 'wake_past', 2],
    ['say', 'past.wake'],
    ['camera', null],
    ['objective', 'find_key'],
    ['save'],
  ] },
  { id: 'ev_past_street', minute: '20-26', on: 'trigger', match: { event: 'past.street' }, steps: [
    ['say', 'past.street'],
  ] },
  { id: 'ev_past_street_clear', minute: '20-26', on: 'group.clear', match: { group: 'st_p' }, if: ['era:past'], steps: [
    ['setFlag', 'street_clear'],
    ['say', 'edmund.appears'],
    ['objective', 'meet_edmund'],
    ['save'],
  ] },

  // ═════════ 26–33 그 밤의 주막과 대장간 ═════════
  { id: 'ev_table', minute: '26-33', on: 'talk', match: { talk: 'edmund.tavern' }, if: ['!met_edmund'], steps: [
    ['music', 'table_warm'],
    ['camera', 'table', 2],
    ['say', 'table.scene'],
    ['sound', 'bell.toll'],
    ['say', 'table.bell'],
    ['camera', null],
    ['setFlag', 'met_edmund'],
    ['objective', 'show_shard'],
  ] },
  { id: 'ev_knot', minute: '26-33', on: 'talk', match: { talk: 'edmund.tavern' }, if: ['met_edmund', 'has:bell_shard', '!has:valkrein_knot'], steps: [
    ['camera', 'knot', 2],
    ['say', 'table.knot'],
    ['take', 'bell_shard'],
    ['give', 'valkrein_knot'],
    ['give', 'wolfram_notice'],
    ['camera', null],
    ['music', 'village_past'],
    ['if', ['key_entrusted'], [['objective', 'ring_big_bell']], [['objective', 'find_key']]],
    ['save'],
  ] },
  { id: 'ev_smithy_past', minute: '26-33', on: 'talk', match: { talk: 'hadwin1.smithy' }, if: ['!key_entrusted'], steps: [
    ['prompt', 'mark'],
    ['say', 'smithy.entrust'],
    ['setFlag', 'key_entrusted'],
    ['setFlag', 'pending_change'],
    ['prompt', 'entrust'],
    ['toast', '맡겼다 — 묘지 문 열쇠', 'info'],
    // what is still missing decides the next line under the section name
    ['if', ['has:valkrein_knot'], [['objective', 'ring_big_bell']], [['if', ['met_edmund'], [['objective', 'show_shard']], [['objective', 'meet_edmund']]]]],
    ['save'],
  ] },
  // the crossing tip comes at the bell, not at the smithy (section `church` holds the big bell)
  { id: 'ev_cross_tip', minute: '33-36', on: 'section.enter', match: { id: 'church' }, if: ['era:past', 'has:valkrein_knot', 'key_entrusted', '!crossed'], steps: [
    ['prompt', 'cross'],
  ] },

  // ═════════ 33–36 성당 앞 큰 종 → 오늘 밤 ═════════
  { id: 'ev_bell_past_no', minute: '33-36', on: 'interact', match: BELL, if: ['era:past', '!crossed'], ifAny: ['!has:valkrein_knot', '!key_entrusted'], once: false, steps: [
    ['say', 'bell.past.no'],
    ['toast', '종이 둔하게 울린다', 'warn'],
  ] },
  { id: 'ev_bell_first', minute: '33-36', on: 'interact', match: BELL, if: ['era:past', 'has:valkrein_knot', 'key_entrusted', '!crossed'], steps: [
    ['say', 'bell.first'],
    ['give', 'lotte_bread'],
    ['prompt', null],
    ['setFlag', 'crossed'],
    ['clearFlag', 'pending_change'],
    ['camera', 'years', 3],
    ['bellCross', { years: true }],
  ] },
  // the other side of the first crossing is its own sequence: a save / load in between cannot lose it
  { id: 'ev_return_first', minute: '33-36', on: 'area.enter', match: { area: 'eshville_now' }, if: ['crossed'], steps: [
    ['camera', null],
    ['banner', 'night', '오늘 밤이 달라졌다', '1797 · 오늘 밤'],
    ['say', 'return.first'],
    ['chronicle', 'fourth_moon'],
    ['objective', 'to_smithy_now'],
    ['save'],
  ] },
  // safety net: tonight, after the fall, but the first crossing is not recorded (a save cut off mid-crossing) — the bell takes the hero back
  { id: 'ev_bell_lost', minute: '33-36', safety: true, on: 'interact', match: BELL, if: ['era:now', 'fell', '!crossed'], once: false, steps: [
    ['bellCross', null],
  ] },
  { id: 'ev_smithy_now', minute: '33-36', on: 'interact', match: { event: 'shop.smithy' }, if: ['era:now'], once: false, steps: [
    ['say', 'hadwin.smithy.now'],
    ['save'],
  ] },
  // every later crossing at any bell (the big bell, road bells, bells inside the dungeon)
  { id: 'ev_bell_cross', minute: '36-45', on: 'interact', match: BELL, if: ['has:valkrein_knot', 'crossed'], ifAny: ['!keepers_promised', 'elise_home'], once: false, steps: [
    ['prompt', null],
    ['if', ['era:past', 'pending_change'], [
      ['clearFlag', 'pending_change'],
      ['camera', 'years', 3],
      ['bellCross', { years: true }],
      ['camera', null],
      ['banner', 'night', '오늘 밤이 달라졌다', '1797 · 오늘 밤'],
    ], [
      ['bellCross', null],
    ]],
  ] },

  // ═════════ 36–45 묘지 가는 길 ═════════
  { id: 'ev_gate_now', minute: '36-45', on: 'exit.locked', match: { id: 'to_graveyard' }, if: ['era:now'], once: false, steps: [
    ['say', 'gate.now'],
    ['save'],
  ] },
  { id: 'ev_graveyard_enter', minute: '36-45', on: 'area.enter', match: { area: 'graveyard_now' }, steps: [
    ['banner', 'area', '2장 — 안개의 묘지', '열쇠와 이름과 길종'],
    ['save'],
  ] },
  { id: 'ev_bats', minute: '36-45', on: 'trigger', match: { event: 'bats.swoop' }, steps: [
    ['prompt', 'wide'],
  ] },
  { id: 'ev_elite', minute: '36-45', on: 'trigger', match: { event: 'elite.gravekeeper' }, steps: [
    ['say', 'elite.gate'],
    ['prompt', 'parry'],
  ] },
  { id: 'ev_elite_down', minute: '36-45', on: 'group.clear', match: { group: 'gate' }, if: ['era:now'], steps: [
    ['prompt', null],
    ['save'],
  ] },
  { id: 'ev_echo_hint', minute: '36-45', on: 'trigger', match: { event: 'echo.hint' }, steps: [
    ['say', 'echo.hint'],
    ['prompt', 'echo'],
  ] },
  { id: 'ev_echo_first', minute: '36-45', on: 'bell.echo', if: ['area:graveyard_now', 'done:ev_echo_hint'], steps: [
    ['prompt', null],
    ['toast', '숨은 유령이 드러났다', 'info'],
  ] },

  // ═════════ 45–58 안개의 묘지 ═════════
  { id: 'ev_grave_now_a', minute: '45-58', on: 'interact', match: { event: 'grave.nameless', 'data.grave': 'a' }, once: false, steps: [
    ['say', 'grave.now.a'],
  ] },
  { id: 'ev_grave_now_b', minute: '45-58', on: 'interact', match: { event: 'grave.nameless', 'data.grave': 'b' }, once: false, steps: [
    ['say', 'grave.now.b'],
  ] },
  { id: 'ev_stones', minute: '45-58', on: 'interact', match: { event: 'sign.valkrein' }, once: false, steps: [
    ['say', 'stones'],
  ] },
  { id: 'ev_ossuary_door_now', minute: '45-58', on: 'interact', match: { event: 'door.ossuary' }, if: ['era:now'], once: false, steps: [
    ['say', 'door.ossuary.now'],
  ] },
  { id: 'ev_ossuary_exit_now', minute: '45-58', on: 'exit.locked', match: { id: 'to_ossuary' }, if: ['era:now'], once: false, steps: [
    ['say', 'door.ossuary.now'],
  ] },
  // that night the threshold only says where the empty post stands: the road bell is hung by the player at the post (interact bell.hang).
  // (The whip landing lies inside this exit's margin: a bridge that ran ev_hang_bell from here used to hang the bell the moment the hero landed.)
  { id: 'ev_ossuary_exit_past', minute: '58-68', on: 'exit.locked', match: { id: 'to_ossuary' }, if: ['era:past'], once: false, steps: [
    ['say', 'door.ossuary.past'],
  ] },
  { id: 'ev_gate_past', minute: '45-58', on: 'exit.locked', match: { id: 'to_graveyard' }, if: ['era:past'], once: false, steps: [
    ['say', 'gate.past'],
    ['save'],
  ] },
  { id: 'ev_keeper_greets', minute: '45-58', on: 'trigger', match: { event: 'keeper.greets' }, steps: [
    ['say', 'keeper.greets'],
    ['setFlag', 'names_known'],
    ['setFlag', 'met_keeper'],
    ['give', 'chisel'],
    ['objective', 'carve_names'],
    ['prompt', 'carve'],
    ['save'],
  ] },
  { id: 'ev_carve_a', minute: '45-58', on: 'interact', match: { event: 'grave.carve', 'data.grave': 'a' }, once: false, steps: [
    ['say', 'grave.carve.a'],
    ['save'],
  ] },
  { id: 'ev_carve_b', minute: '45-58', on: 'interact', match: { event: 'grave.carve', 'data.grave': 'b' }, once: false, steps: [
    ['say', 'grave.carve.b'],
    ['save'],
  ] },

  // ═════════ 58–68 묘지 깊은 곳 ═════════
  { id: 'ev_edmund_grave', minute: '58-68', on: 'trigger', match: { event: 'grave.edmund' }, if: ['area:graveyard_past', '!bell_hung', '!has:road_bell'], steps: [
    ['say', 'grave.edmund'],
    ['give', 'road_bell'],
    ['objective', 'hang_bell'],
    ['prompt', 'hook'],
  ] },
  { id: 'ev_hang_bell', minute: '58-68', on: 'interact', match: { event: 'bell.hang' }, if: ['area:graveyard_past', '!bell_hung'], steps: [
    ['if', ['!has:road_bell'], [['run', 'ev_edmund_grave']]],
    ['prompt', null],
    ['take', 'road_bell'],
    ['setFlag', 'bell_hung'],
    ['toast', '걸었다 — 길종', 'info'],
    ['say', 'grave.hang'],
    ['clearFlag', 'pending_change'],
    ['camera', 'years', 3],
    ['bellCross', { years: true }],
  ] },
  { id: 'ev_hung_now', minute: '58-68', on: 'area.enter', match: { area: 'graveyard_now' }, if: ['bell_hung'], steps: [
    ['camera', null],
    ['banner', 'night', '오늘 밤이 달라졌다', '1797 · 오늘 밤'],
    ['chronicle', 'road_bell'],
    ['objective', 'enter_ossuary'],
    ['save'],
  ] },
  { id: 'ev_ossuary_door_past', minute: '58-68', on: 'interact', match: { event: 'door.ossuary' }, if: ['era:past'], once: false, steps: [
    ['say', 'door.ossuary.past'],
  ] },

  // ═════════ 68–82 납골당 앞 절반 ═════════
  { id: 'ev_oss_enter', minute: '68-82', on: 'area.enter', match: { area: 'ossuary_now' }, steps: [
    ['banner', 'area', '3장 — 배웅하는 노래', '배웅의 납골당'],
    ['music', 'ossuary_now'],
    ['showActor', 'sera', 'ossuary_now'],        // Sera stands at the lantern from the first step into the dungeon (she used to be there only after a talk in the square that nothing asks for)
    ['hideActor', 'sera', 'eshville_now'],
    ['say', 'oss.enter'],
    ['objective', 'follow_song'],
    ['save'],
  ] },
  { id: 'ev_oss_coffins', minute: '68-82', on: 'trigger', match: { event: 'oss.coffins' }, steps: [
    ['say', 'oss.coffins'],
    ['prompt', 'roomcross'],
  ] },
  { id: 'ev_oss_past_first', minute: '68-82', on: 'area.enter', match: { area: 'ossuary_past' }, if: ['!queen_fled'], steps: [
    ['prompt', null],
    ['music', 'ossuary_past'],
    ['say', 'oss.past.first'],
    ['save'],
  ] },
  { id: 'ev_oss_wedge', minute: '68-82', on: 'interact', match: { event: 'oss.wedge' }, once: false, steps: [
    ['if', ['!wedge_stone'], [['prompt', 'aging']]],
    ['say', 'oss.wedge'],
    ['save'],
  ] },
  { id: 'ev_oss_gap', minute: '68-82', on: 'trigger', match: { event: 'oss.gap' }, once: false, steps: [
    ['say', 'oss.gap'],
  ] },
  { id: 'ev_oss_arena', minute: '68-82', on: 'trigger', match: { event: 'oss.arena' }, steps: [
    ['wakeGroup', 'oss_arena'],
  ] },

  // ═════════ 82–100 납골당 뒤 절반 ═════════
  { id: 'ev_oss_sera', minute: '82-100', on: 'trigger', match: { event: 'oss.lamp' }, steps: [
    ['showActor', 'sera', 'ossuary_now'],        // (a save from before she was shown at the dungeon's door: she is at the lantern now)
    ['say', 'sera.ossuary'],
    ['hideActor', 'sera', 'eshville_now'],       // she is here now, not in the square
    ['save'],
  ] },
  { id: 'ev_oss_riddle', minute: '82-100', on: 'interact', match: { event: 'oss.riddle' }, once: false, steps: [
    ['say', 'oss.riddle'],
  ] },
  { id: 'ev_oss_riddle_echo', minute: '82-100', on: 'bell.echo', if: ['area:ossuary_now', 'at_riddle', '!riddle_done'], steps: [
    ['prompt', null],
    ['say', 'oss.riddle.echo'],
    ['setFlag', 'riddle_done'],
    ['objective', 'hang_knells'],
    ['save'],
  ] },
  { id: 'ev_knell_take', minute: '82-100', on: 'area.enter', match: { area: 'ossuary_past' }, if: ['riddle_done', '!knells_hung', '!has:knell_bell', '!knell_1', '!knell_2', '!knell_3', '!knell_4'], steps: [
    ['say', 'oss.knell.take'],
    ['give', 'knell_bell', 4],
    ['save'],
  ] },
  { id: 'ev_knell_1', minute: '82-100', on: 'interact', match: { event: 'oss.knell', 'data.post': 1 }, if: ['has:knell_bell', '!knell_1'], steps: [
    ['take', 'knell_bell'], ['setFlag', 'knell_1'], ['toast', '걸었다 — 조종', 'info'],
    ['if', ['knell_1', 'knell_2', 'knell_3', 'knell_4'], [['run', 'ev_knells_done']]],
    ['save'],
  ] },
  { id: 'ev_knell_2', minute: '82-100', on: 'interact', match: { event: 'oss.knell', 'data.post': 2 }, if: ['has:knell_bell', '!knell_2'], steps: [
    ['take', 'knell_bell'], ['setFlag', 'knell_2'], ['toast', '걸었다 — 조종', 'info'],
    ['if', ['knell_1', 'knell_2', 'knell_3', 'knell_4'], [['run', 'ev_knells_done']]],
    ['save'],
  ] },
  { id: 'ev_knell_3', minute: '82-100', on: 'interact', match: { event: 'oss.knell', 'data.post': 3 }, if: ['has:knell_bell', '!knell_3'], steps: [
    ['take', 'knell_bell'], ['setFlag', 'knell_3'], ['toast', '걸었다 — 조종', 'info'],
    ['if', ['knell_1', 'knell_2', 'knell_3', 'knell_4'], [['run', 'ev_knells_done']]],
    ['save'],
  ] },
  { id: 'ev_knell_4', minute: '82-100', on: 'interact', match: { event: 'oss.knell', 'data.post': 4 }, if: ['has:knell_bell', '!knell_4'], steps: [
    ['take', 'knell_bell'], ['setFlag', 'knell_4'], ['toast', '걸었다 — 조종', 'info'],
    ['if', ['knell_1', 'knell_2', 'knell_3', 'knell_4'], [['run', 'ev_knells_done']]],
    ['save'],
  ] },
  { id: 'ev_knells_done', minute: '82-100', steps: [
    ['say', 'oss.knells.done'],
    ['setFlag', 'knells_hung'],
    ['setFlag', 'pending_change'],
    ['objective', 'face_queen'],
  ] },

  // ═════════ 104–114 납골당 맨 안 — 밴시 여왕 ═════════
  { id: 'ev_boss_intro', minute: '104-114', on: 'trigger', match: { event: 'boss.enter' }, if: ['area:ossuary_now', '!queen_sent'], steps: [
    ['camera', 'banshee_song', 3],
    ['music', 'boss_banshee'],
    ['say', 'boss.intro'],
    ['camera', null],
    ['if', ['knells_hung'], [['prompt', 'knellpost']]],
    ['objective', 'fight_queen'],
  ] },
  // The flight, the chase and the return are staged by the scene (src/v2/game/chapter.js): `flee` is raised when the queen has torn through the hall's bell at half
  // health and is gone from tonight; `driven` when the hero has brought her down to a quarter in 1697 and she has torn back. Each stretch ends in a save.
  { id: 'ev_boss_flee', minute: '104-114', on: 'boss.phase', match: { phase: 'flee' }, if: ['area:ossuary_now'], steps: [
    ['say', 'boss.flee'],
    ['setFlag', 'queen_fled'],
    ['prompt', 'chase'],
    ['objective', 'chase_queen'],
    ['save'],
  ] },
  { id: 'ev_boss_past', minute: '104-114', on: 'area.enter', match: { area: 'ossuary_past' }, if: ['queen_fled', '!queen_driven'], steps: [
    ['prompt', null],
    ['say', 'boss.past'],
    ['objective', 'drive_queen'],
    ['save'],
  ] },
  { id: 'ev_boss_driven', minute: '104-114', on: 'boss.phase', match: { phase: 'driven' }, if: ['area:ossuary_past'], steps: [
    ['say', 'boss.driven'],
    ['setFlag', 'queen_driven'],
    ['prompt', 'chaseback'],
    ['objective', 'back_queen'],
    ['save'],
  ] },
  { id: 'ev_boss_back', minute: '104-114', on: 'area.enter', match: { area: 'ossuary_now' }, if: ['queen_driven', '!queen_sent'], steps: [
    ['prompt', null],
    ['objective', 'send_queen'],
    ['save'],
  ] },
  { id: 'ev_boss_kneel', minute: '104-114', on: 'boss.phase', match: { phase: 'kneel' }, if: ['area:ossuary_now'], once: false, steps: [
    ['prompt', 'knell'],
  ] },
  // in 1697 the bell of the last hall answers dull until the queen has fled through it (the world gives it the event bell.sealed until then)
  { id: 'ev_bell_sealed', minute: '100-104', on: 'interact', match: { event: 'bell.sealed' }, once: false, steps: [
    ['say', 'bell.sealed'],
    ['toast', '종이 둔하게 울린다', 'warn'],
  ] },
  { id: 'ev_boss_sent', minute: '104-114', on: 'boss.phase', match: { phase: 'sent' }, if: ['area:ossuary_now', '!queen_sent'], steps: [
    ['prompt', null],
    ['music', 'quiet'],
    ['say', 'boss.sent'],
    ['setFlag', 'queen_sent'],
    ['if', ['knells_hung'], [['chronicle', 'four_knells']]],
    ['chronicle', 'banshee'],
    ['candle', 1],
    ['say', 'lia.warn'],
    ['give', 'crow_feather'],
    ['objective', 'wake_elise'],
    ['save'],
  ] },
  // the spot beside the sleeping girl says what she herself says when pressed (talk elise.asleep): asleep until the queen is sent, then she wakes
  // and the two go up to Lotte (the dialogue set carries the flag and the journey, so that both ways in do the same)
  { id: 'ev_elise_wake', minute: '104-114', on: 'interact', match: { event: 'oss.elise' }, once: false, steps: [
    ['say', 'elise.asleep'],
  ] },

  // ═════════ 114–118 그 밤의 종탑 (종탑이 지어지기 전에는 큰 종 앞) ═════════
  { id: 'ev_keepers', minute: '114-118', on: 'area.enter', match: { area: 'eshville_past' }, if: ['elise_found', '!keepers_promised'], steps: [
    ['lockInput', true],
    ['showActor', 'elise', 'eshville_past'],     // she came with the hero and stands beside him (spawn `keepers`, left of the bell); Lotte waits at her bell
    ['say', 'keepers.found'],
    // cut 7 (GDD 9.1 minute 114-118): the camera goes to the bell first, then Elise walks through the picture - past Lotte, in front of the bell - to its right side;
    // the two keepers stand with the bell between them and look at each other, the hero at the picture's left edge
    ['camera', 'two_keepers', 0.9],
    ['moveActor', 'elise', [4200, 1386]],
    ['moveActor', 'elise', [4296, 1436], { face: [4104, 1436] }],
    ['moveActor', 'lotte', [4104, 1436], { face: [4296, 1436] }],
    ['wait', 0.5],
    ['say', 'keepers.promise'],
    ['camera', null],
    ['lockInput', false],
    ['setFlag', 'keepers_promised'],
    ['prompt', 'cross'],
    ['objective', 'go_home'],
    ['save'],
  ] },

  // ═════════ 118–120 오늘 밤의 에슈빌 ═════════
  { id: 'ev_ending', minute: '118-120', on: 'interact', match: BELL, if: ['era:past', 'keepers_promised', '!elise_home'], steps: [
    ['prompt', null],
    ['moveActor', 'lotte', [4104, 1436], { face: 'hero' }],   // (she turns from Elise to the hunter for her last question)
    ['camera', 'two_keepers', 0.8],
    ['say', 'ending.bread'],
    ['clearFlag', 'pending_change'],
    ['hideActor', 'elise', 'eshville_past'],
    ['camera', 'years', 3],
    ['bellCross', { years: true }],
  ] },
  // tonight's side of the last crossing (its own sequence — see ev_return_first)
  { id: 'ev_ending_home', minute: '118-120', on: 'area.enter', match: { area: 'eshville_now' }, if: ['keepers_promised', '!elise_home'], steps: [
    ['camera', null],
    ['hideActor', 'elise', 'eshville_past'],
    ['showActor', 'elise', 'eshville_now'],
    ['showActor', 'sera', 'eshville_now'],
    ['hideActor', 'sera', 'ossuary_now'],
    ['setFlag', 'elise_home'],
    ['music', 'dawn_bell'],
    // the same picture as the two keepers' cut, a hundred years later: Elise right of the bell where she stood, Lotte's place left of it empty
    ['lockInput', true],
    ['camera', 'two_keepers', 1.2],
    ['say', 'ending.bell'],
    ['setFlag', 'bells_answered'],
    ['banner', 'night', '오늘 밤이 달라졌다', '종소리가 제 울림을 되찾았다'],
    ['moon', 1],
    ['candle', 1],
    ['chronicle', 'two_keepers'],
    ['camera', 'ring_widen', 4],                  // the camera rises over the church front while the sound goes out (the valley map is the ending card's)
    ['ring', 1],
    ['toast', '종소리가 장미 수녀원과 잠긴 수문까지 닿는다', 'info'],
    ['moveActor', 'alberto', [4104, 1436], { face: [4296, 1436] }],   // the old priest comes to the bell - and stands where Lotte stood - before her name is said
    ['camera', 'two_keepers', 1],
    ['say', 'ending.town'],
    ['camera', null],
    ['lockInput', false],
    ['banner', 'clear', '달이 한 칸 기울었다', '종소리가 한 겹 더 멀리 닿는다'],
    ['prompt', 'letter'],
    ['objective', 'r1_end'],
    ['end', 'r1'],
    ['save'],
  ] },

  // ═════════ 쓰러졌을 때 · 다시 일어설 때 ═════════
  { id: 'ev_dead', minute: 'any', on: 'hero.dead', once: false, steps: [
    ['banner', 'dead', '촛불이 꺼졌다', '종이 울린다. 다시 일어선다'],
  ] },
  { id: 'ev_retry_boss', minute: 'any', on: 'hero.respawn', if: ['done:ev_boss_intro', '!queen_sent'], steps: [
    ['say', 'retry.boss'],
  ] },
  { id: 'ev_retry_1', minute: 'any', on: 'hero.respawn', ifAny: ['!done:ev_boss_intro', 'queen_sent'], steps: [
    ['say', 'retry.line'],
  ] },
  { id: 'ev_retry_2', minute: 'any', on: 'hero.respawn', if: ['done:ev_retry_1'], steps: [
    ['say', 'retry.again'],
  ] },
];
