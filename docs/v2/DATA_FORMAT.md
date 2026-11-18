# DATA_FORMAT — 이야기 자료 모양 (STORY 구역)

2026-11-17 · first version 23:30 UTC, second version 00:00 UTC (the runner, the script of the first release and the check exist). Code and text: `tools/v2/story_stage/` (staged; the main session moves the folder to `src/v2/data/` and rebuilds the fonts in the same step — see §11). Check: `node tools/v2/story_check.mjs`. Owner script: `/tmp/claude-0/v2/story/script_owner.md`.
(The body is in English so that every lane can read it fast. Everything the player sees is Korean.)

## 바뀐 것
- 23:30 first version: shapes, key names, step vocabulary, the api the runner needs, save shape.
- 00:00 second version, after writing and playing the whole script: `ifAny` on variants and events; `bridge` / `waiting` on events (§4); the `prompt` step also shows the tip as a notice; the dialogue object carries `who`; listeners of one event are all tested before any of them starts (§4); `save` may be the last step of a `run` chain; new §12 (hooks STORY expects from areas that are not built) and §13 (status, check, numbers).

- 00:20 review (STORY-REVIEW lane), see `/tmp/claude-0/v2/story/review_changes.md`:
  - **A sequence ends at an area change.** `gotoArea` / `bellCross` is the last step; what happens on the other side is a second sequence on `area.enter` with a flag condition (`ev_return_first`, `ev_hung_now`, `ev_ending_home`). A save / load between the two can no longer lose the second half or leave the hero in a night the story does not know about.
  - **The scene restores the hero from the story save**: `save().area` / `.spawn` (§10) are where the hero stands when the game is loaded — not the scene's own idea of the current area. `ev_bell_lost` (`safety: true`) is the net for a save that still disagrees: tonight + fell + not crossed → the bell takes the hero back.
  - **The same sequence is never started twice at once** (runner): a second press of a bell / a person while their sequence runs or waits in the queue is dropped.
  - New event field `safety: true` (a net for cut-off saves; the check does not ask for it to be reached). New listener `section.enter {id: 'church'}` (the crossing tip appears at the bell). New hooks: `group.clear {group: 'out_a'}`, `exit.locked {id: 'to_belltower'}`, `exit.locked {id: 'to_ossuary'}` in both nights, trigger `grave.edmund` (§12).
  - Out-of-place events are ignored: tower sequences need `promise`, boss beats need `area:ossuary_now` / `area:ossuary_past`, the road bell needs `area:graveyard_past`.
  - Break tests: `node --expose-gc tools/v2/story_break.mjs` (unknown events, wrong order, double presses, save mid-sequence, choice under load, 10,000 unmatched events).

## 0. At a glance

```
tools/v2/story_stage/        (→ src/v2/data/)
  index.js       export const STORY (all tables in one object) · export { createStory }
  run.js         createStory(data, opts) — the only code. Pure, no browser / Node API, imports nothing.
  people.js      PEOPLE
  dialogs_now.js · dialogs_past.js · dialogs_dungeon.js     DIALOGS (talk key → variants): tonight · that night · bell tower, ossuary, boss, ending
  events.js      EVENTS (sequences)
  items.js       ITEMS · OBJECTIVES
  chronicle.js   CHRONICLE
  flags.js       FLAGS
  text.js        TEXT (banners, tutorial prompts, death / retry lines, system lines)
```

Rules for every file in the folder: imports only from inside the folder (relative paths), no `window` / `document` / `localStorage` / timers / `fetch` / Node modules. Data files contain literals only.

Use from the game scene:

```js
import { STORY, createStory } from '../data/index.js';
const st = createStory(STORY, { warn: (m) => console.warn('[story]', m) });
scene.setStory(st.story);                 // ENGINE_API §6: story(name, data, api)
// actor pressed:   st.talk(actor.talk, api)       (or raise the event  talk {id, talk})
// actor `when`:    st.flag('square_clear')
// save / load:     const obj = st.save();  …  st.load(obj)
```

## 1. Conditions (used by dialogue variants, events, chronicle)

A condition is a **list of strings; all must hold** (`if`), and — when `ifAny` is given too — at least one of that list. An empty or missing list is true.

| string | true when |
|---|---|
| `'name'` | flag `name` is set (truthy) |
| `'!name'` | flag is not set |
| `'era:past'` · `'era:now'` | the current night (`state.era`, updated on `area.enter`) |
| `'area:eshville_now'` | the current area id |
| `'has:key_silver'` · `'!has:key_silver'` | the item is (not) in the bag |
| `'done:ev_id'` · `'!done:ev_id'` | the sequence has (not) finished |
| `'seen:talk.key'` · `'!seen:talk.key'` | the dialogue set has (not) been played at least once |

## 2. People — `PEOPLE[id]`

```js
alberto: {
  id: 'alberto',
  name: '알베르토 신부',          // name plate
  title: '에슈빌 성당의 사제',      // one line for lists
  eras: ['now'],                  // 'now' = 1797 오늘 밤 · 'past' = 1697 그 밤
  model: 'alberto',               // assets/v2/char3d/<model>.glb, or null (voice only / not built)
  portrait: 'alberto',            // assets/v2/portraits/<portrait>.webp, or null (no bust)
  moods: { joy: 'elise__joy' },   // mood name → portrait file id (optional)
  side: 'left',                   // bust side in the dialogue box (the hero is 'right')
  voice: '하게체(~하게, ~일세, ~다네). 느리고 따뜻하다. 버릇말 「허허」.',   // how they speak — the rule the lines are checked against by hand
}
```

Special ids: `narrator` (no name plate = 해설), `kael` (the hero), `sign` (글씨·비석·쪽지 — shown as 해설 with a title line).

## 3. Dialogue sets — `DIALOGS[talkKey]`

`talkKey` is what an area actor carries in `talk` (AREA_FORMAT §4) or what a `say` step names. A set is a **list of variants, first match wins** (put the default last, without `if`).

```js
'hadwin.smithy.now': [
  { if: ['left_key', '!has:key_silver', '!gate_open'],       // conditions (§1)
    once: true,                                              // optional: this variant plays only once (state.seen)
    pages: [                                                 // one page = one screen of the dialogue box
      ['hadwin', '할아버지 때부터 내려온 건데,\n이름 칸이 비어 있소.'],          // [who, text, mood?]
      ['hadwin', '선불이랍디다.'],
    ],
    choice: {                                                // optional two-way choice, shown on the last page
      options: [
        { label: '은 열쇠', pages: [...], then: [['setFlag', 'key_is_silver']] },
        { label: '쇠 열쇠', pages: [...], then: [['setFlag', 'key_is_iron']] },
      ],
    },
    then: [['give', 'key_silver'], ['setFlag', 'got_key']],  // steps (§4) run after the pages (and after the chosen option)
  },
  { pages: [['hadwin', '…망치질 중이오.']] },                // default
],
```

- **Page rule: at most 2 lines, each at most 30 Hangul-width characters** (`\n` between the lines). Longer speech = more pages. The check enforces it.
- `who` is a `PEOPLE` id; `mood` picks `PEOPLE[who].moods[mood]` as the portrait. The object given to `showDialog` is the UI_API §4 shape plus `who` (the id — `narrator` and `sign` have an empty `speaker`; the UI may style `sign` as written text).
- Kael's inner voice is written in round brackets `(…)`; the UI may draw it dimmer. He has no bust yet (`portrait: null`).
- Era variants: use `'era:past'` / `'era:now'` in `if`, or separate keys (`rook.now`, `rook.past`) when the area already names them so.
- A set with no matching variant plays nothing and warns once.

## 4. Event sequences — `EVENTS[i]`

```js
{ id: 'ev_square_clear',
  minute: '5-12',                        // row of GDD §9.1 (for the owner script and the check order)
  on: 'group.clear',                     // ENGINE event name (§6)
  match: { group: 'sq' },                // every key must equal the event data (dotted keys reach inside: 'data.grave': 'a')
  if: ['era:now'],                       // conditions (§1)
  once: true,                            // default true: finished sequences never run again (state.done)
  waiting: null,                         // or 'belltower_now' / 'ossuary_now' / 'hook:<what>' = the area or hook is not built yet
  steps: [
    ['setFlag', 'square_clear'],
    ['say', 'sera.square.first'],
    ['objective', 'to_church'],
  ],
}
```

Sequences run **one at a time**; a second match while one runs is queued. A step that waits (marked ⏳) suspends the sequence until the game answers; nothing runs per frame.
When an event arrives, **all** its listeners are tested against the state of that moment and then started in table order (a sequence that sets a flag cannot make a later listener of the same event fire).
`waiting: 'ossuary_now'` (an area id) or `'hook:<area>/<what>'` marks a sequence whose area or hook WORLD has not built — the text is final, the check skips the hook test. `bridge: true` marks a sequence that exists only to cross such a gap today (it plays the waiting scenes as text through `run`); delete it when the area arrives. A sequence without `on` runs only through `run`.

| step | arguments | what the runner asks of the game (§5) |
|---|---|---|
| `say` ⏳ | `key` ｜ inline pages `[[who, text, mood?], …]` | `api.showDialog(d)` once per page; the next page / step runs from `onDone` / `onChoice`. Input is locked while it is open (the HUD does that through `hud.modal`) |
| `banner` | `kind, title, sub?` | `api.banner(kind, title, sub)` — kinds of UI_API §2: `area section night clear dead` |
| `toast` | `text, kind?` | `api.toast(text, {kind})` — `item info warn` |
| `prompt` | `textId ｜ null` | `TEXT.prompts[textId]` = `{action, label, tip}`: `api.prompt({action, label, tip})` puts the pill up (skipped when `action` is null) and `api.toast(tip, {kind:'info'})` shows the one-line explanation. `null` clears the pill |
| `give` | `item, n = 1` | bag += n, then `api.toast('얻었다 — <name>', {kind:'item'})` and `api.onItem?.(id, count)` |
| `take` | `item, n = 1` | bag −= n, `api.onItem?.(id, count)` (no toast) |
| `setFlag` · `clearFlag` | `name` | state only, then `api.onFlag?.(name, value)` so the scene can show / hide actors with `when` |
| `unlockExit` · `lockExit` | `exitId, areaId?` ｜ `exitId, key, areaId?` | `api.unlockExit(exitId, areaId)` / `api.lockExit(exitId, key, areaId)`; also remembered in `state.exits` and **called again on every `area.enter` of that area** (so the scene needs no memory of its own) |
| `wakeGroup` | `group` | `api.wakeGroup(group)` |
| `spawn` | `kind, at, opts?` | `api.spawn(kind, at, opts)` — `at` = spawn name, interact / actor id, or `[x, z]` |
| `moveActor` ⏳ | `actorId, to, opts?` | `api.moveActor(id, to, opts, done)` — walk there; `opts.pose` at the end |
| `hideActor` · `showActor` | `actorId, areaId` | `api.hideActor(id, areaId)` / `api.showActor(id, areaId)`; remembered in `state.actors` and called again on every `area.enter` of that area. Wins over the actor's `when` |
| `camera` ⏳ | `shot, seconds?` | `api.camera(shot, seconds, done)` — `shot` = a name from `TEXT.shots` (described there) or `null` = back to the section rig |
| `wait` ⏳ | `seconds` | `api.wait(seconds, done)` |
| `sound` · `music` · `fx` | `name, at?` ｜ `id` ｜ `name, o?` | `api.sound(name, at)` · `api.music(id)` · `api.fx(name, o)` |
| `objective` | `id ｜ null` | `state.objective = id`, `api.objective(text, id)` — the short text under the section name |
| `chronicle` | `id` | adds to `state.chronicle` (once), then `api.chronicle?.(entry)`; without that function a notice 「연대기 — <title>」 |
| `candle` | `n` | `api.candle(n)` — `+1` = one more candle (max health), `0` = refill (rest) |
| `moon` · `ring` | `step` | `api.moon(step)` (moon cell 0–7) · `api.ring(n)` (bell-sound circle on the map) |
| `save` | — | `api.save(storyObj.save())` — **always the last step of a sequence** (the copy counts the sequence as finished) |
| `gotoArea` ⏳ | `areaId, spawn?` | `api.gotoArea(id, spawn)`; resumes on the next `area.enter` |
| `bellCross` ⏳ | `opts?` | `api.bellCross(opts)` — to the twin area at the same spot, with the "hundred years in three seconds" shot when `opts.years`; resumes on `area.enter` |
| `lockInput` | `on` | `api.lock(on)` |
| `if` | `conds, steps, elseSteps?` | — |
| `run` | `eventId` | runs another sequence's steps inline (ignores its `on` / `if`) |
| `end` | `id` | `api.end?.(id)` — end of the first release (credits / back to title) |

Anything the api does not have is **skipped with one warning** (`opts.warn`), and a waiting step continues at once — the story never blocks the game.

## 5. The api the runner needs from the game scene

`api` is the third argument of `story(name, data, api)`. For each call the runner looks at `api.<name>`, then `api.scene?.hud?.<name>` (UI functions), then `api.scene?.<name>`. Two exceptions: `toast` prefers `api.scene.hud.toast` (the v2 notice) over ENGINE's `api.toast` (the old shell toast); a dialogue falls back to `api.setDialog(d)` when there is no `showDialog` (the runner clears it with `setDialog(null)` when the page is dismissed). So with today's ENGINE api (`scene, lock, toast, gotoArea, fx, sound, setDialog` + `scene.hud` + `scene.wakeGroup`) dialogue, banners, notices, input lock, area changes and enemy groups already work; every row marked **new** is skipped with one warning until the scene supplies it.

| function | arguments | must do | async | status |
|---|---|---|---|---|
| `showDialog(d)` | UI_API §4 object: `{speaker, portrait, side, text, choices?, onDone, onChoice}` | open the dialogue box; call `onDone()` when the page is dismissed or `onChoice(i)` | yes (callback) | exists (UI `hud.showDialog`) |
| `banner(kind, title, sub)` | | big strip | no | exists (UI) |
| `toast(text, opts)` | | small notice | no | exists (UI `hud.toast`; ENGINE `api.toast(text)`) |
| `lock(on)` | boolean | lock hero input | no | exists (ENGINE) |
| `gotoArea(id, spawn)` | | change area; raise `area.enter` when open | yes (event) | exists (ENGINE) |
| `sound(name, pos)` · `fx(name, o)` | | | no | exists (ENGINE) |
| `wakeGroup(group)` | | wake an enemy group | no | exists (`scene.wakeGroup`) |
| `unlockExit(exitId, areaId)` | `areaId` may be another area than the current one (then only remember it) | set `exits[i].locked = null` now, and again whenever that area loads (the runner also keeps `state.exits['<area>/<exit>'] = null`; the scene may read `storyObj.exitLock(area, exit, original)` on load) | no | **new** |
| `lockExit(exitId, key, areaId?)` | | the reverse | no | **new** |
| `prompt(p)` | `{action, label, tip}` ｜ `null` | put one pill into `state.prompts` (UI_API §1) until the next `prompt` call; the scene may place it over the nearest matching interact spot | no | **new** (the field exists in the UI) |
| `objective(text, id)` | `text` may be `''` | show the line under the section name | no | **new** |
| `onFlag(name, value)` | | optional: re-evaluate actors with `when` | no | **new** (optional) |
| `onItem(id, count)` | | optional: bag screen | no | **new** (optional) |
| `spawn(kind, at, opts)` | | add an enemy / prop actor | no | **new** |
| `moveActor(id, to, opts, done)` | | walk an actor; call `done()` | yes (callback) | **new** |
| `hideActor(id, areaId)` · `showActor(id, areaId)` | | hide / show a person of that area (ignore when it is not the current area — the runner calls again on `area.enter`) | no | **new** |
| `camera(shot, seconds, done)` | | scripted camera; call `done()` | yes (callback) | **new** |
| `wait(seconds, done)` | | call `done()` after game time | yes (callback) | **new** |
| `music(id)` | area music ids + `TEXT.music` | cross-fade | no | **new** |
| `candle(n)` · `moon(step)` · `ring(n)` | | health candles · moon cell · map circle | no | **new** |
| `chronicle(entry)` | `CHRONICLE` entry | optional: chronicle screen / notice | no | **new** (optional) |
| `bellCross(opts)` | `{years?: true, to?: areaId}` | go to `area.twin` keeping `x, z` (AREA_FORMAT §3), play the crossing effect, raise `area.enter` | yes (event) | **new** |
| `save(obj)` | plain JSON object | write it to storage | no | **new** |
| `end(id)` | | end screen | no | **new** (optional) |

## 6. Events the runner listens to

Existing (ENGINE_API §6): `area.enter {area}` · `section.enter {id, from}` · `enemy.kill {enemy}` · `area.clear {area}` · `hero.dead {}` · `hero.respawn {}` · `trigger {id, event, data}` · `exit {id, to, spawn}` · `exit.locked {id, locked}` · `exit.missing {id, to}` · `play.<name>`.

**New — the scene has to raise these:**

| event | data | when |
|---|---|---|
| `interact` | `{id, kind, event, data}` | the hero uses an `interact` spot (AREA_FORMAT §5). For `kind: 'bell'` this is the long press of 「종」 in front of the bell |
| `talk` | `{id, talk}` | the hero talks to an actor. The runner plays `DIALOGS[talk]` (same as `storyObj.talk(talk, api)`) |
| `group.clear` | `{group}` | the last enemy of a group fell. If the scene cannot, the runner derives it from `enemy.kill {enemy}` (`enemy.group`) when `api.groupLeft(group)` exists and returns 0 |
| `bell.echo` | `{}` | short press of 「종」 (메아리) |
| `boss.phase` | `{boss, phase}` | boss fight beats, PLAY: `flee` (half health: she leaves through the crack) · `driven` (beaten back in the other night) · `kneel` (ready for the knell) · `sent` (the long press of 「종」 landed) |

`area.enter` must carry `{area, era}` or the runner reads `api.scene.area.era`.

## 7. Items · objectives

```js
ITEMS.key_silver = { id: 'key_silver', name: '낡은 은 열쇠', desc: '백 년 묵은 묘지 문 열쇠. 은은 녹슬지 않는다.', kind: 'key' };
OBJECTIVES.to_church = { id: 'to_church', text: '성당으로 간다' };     // ≤ 16 characters, shown under the section name
```

`kind`: `key` (opens something) · `tool` (stays with the hero: 종 조각, 매듭) · `keepsake` (story thing) · `food` · `letter`.

## 8. Chronicle — `CHRONICLE[id]`

The in-game record (알베르토 신부의 연대기). An entry is either a **written line** (cannot change) or a **blank** the player fills.

```js
key_silver: {
  id: 'key_silver', order: 3, kind: 'blank',            // 'line' | 'blank'
  title: '묘지 문 열쇠',
  body: '묘지 문의 열쇠는 그 밤 뒤로 본 사람이 없다.',      // what the chronicle says before (for a blank: the gap)
  past: '그 밤 — 하드윈 1세에게 은 열쇠를 맡겼다.',        // filled: what was done that night
  now:  '오늘 밤 — 손자의 서랍에 백 년 묵은 열쇠가 있다.',  // filled: what is different tonight
  unlock: ['got_key'],                                  // conditions (§1) — when true the entry shows `past` / `now`
  show: [],                                             // conditions for the entry to be listed at all (missing = always)
}
```

## 9. Flags — `FLAGS[name]`

```js
square_clear: { means: '광장의 해골을 모두 쓰러뜨렸다', world: true,          // world: an area actor uses it in `when`
                set: ['ev_square_clear'], read: ['area:eshville_now/sera', 'sera.square.now'] }
```

Every flag used anywhere must be declared; `set` / `read` list sequence ids, talk keys and `area:<id>/<actor>`; the check recomputes both lists and fails when they differ (`node tools/v2/story_check.mjs --sync-flags` rewrites them).

## 10. Story state and save shape

`storyObj.state` (live) and `storyObj.save()` (a plain JSON copy):

```js
{ v: 1,
  flags: { square_clear: true, … },
  items: { key_silver: 1 },
  done: ['ev_opening', …],          // finished once-sequences
  seen: { 'lotte.fell': 2 },        // times a dialogue set was played; 'key#i' for once-variants
  chronicle: ['bell_cracked', …],   // unlocked entries, in order
  objective: 'to_church',
  exits: { 'eshville_now/to_graveyard': null },   // lock overrides
  actors: { 'eshville_past/edmund': 'hide' },     // hide / show overrides
  area: 'eshville_now', era: 'now', spawn: 'bell',
  moon: 0, ring: 0, candles: 3 }
```

`save()` while a sequence is running returns the copy taken **when that sequence started** — a cut-off scene replays from its beginning after loading, never from the middle. `load(obj)` replaces the state (unknown keys ignored, missing keys defaulted) and drops running sequences. `reset()` = new game.

## 11. Moving the staged folder into the game (main session)

1. `git mv tools/v2/story_stage src/v2/data` (the folder has no imports to the outside).
2. `python3 tools/fonts/build_fonts.py` (rebuild — the story brings new Hangul; the list and count are printed by `node tools/v2/story_check.mjs`, section "fonts"), then `--check`.
3. `node tools/v2/story_check.mjs --dir src/v2/data` must still exit 0.

## 12. Hooks STORY expects from areas that are not built yet

Everything below is already written and played by the check (route A simulates these events). Names may change — tell STORY, the table in `events.js` is the only place to edit.

| area | what STORY listens to | sequences |
|---|---|---|
| `eshville_now` | **actor `hadwin`** at the smithy with `talk: 'hadwin.smithy.now'` (today only `interact smithy_door`, event `shop.smithy`, locked `not_built` — `ev_smithy_now` listens to it as a bridge; ENGINE must raise `interact` for it even though it is "not built") | grandson's drawer, 33–36 |
| `eshville_past` | **actor `elise`** near the big bell (the story shows her with `showActor('elise', 'eshville_past')` after the rescue; give her `when: 'elise_found'` or start hidden). `interact inn_door` (event `door.tavern`) and the actor `edmund` (talk `edmund.tavern`) already exist — the table scene starts from talking to him | 26–33, 114–118 |
| `graveyard_past` | **trigger `{ event: 'grave.edmund' }`** on the near side of the broken stone path (Edmund stands there: actor `edmund`, `when: 'past_gate_open'`; he hands over the road bell and the whip-ring tip appears) and **`interact { id: 'road_bell', kind: 'bell', event: 'bell.hang' }`** on the far side of the broken stone path in front of the ossuary (a whip ring to cross). After it is hung the same spot is a bell in both eras: `event: 'bell.ring'` (in `graveyard_now` always). Until then `ev_ossuary_door_past` starts the scene from `interact ossuary_door` | 58–68 |
| `belltower_now` | spawn `bottom`; trigger `{ event: 'tower.top', wake: 'tower_bats' }` at the bell; enemy group `tower_bats` (bats); actor `elise` at the rope. The fall is `gotoArea('eshville_past', 'from_belltower')` | 15–20 |
| `belltower_past` | optional. Today the two keepers' promise plays in `eshville_past` at spawn `bell` (`ev_keepers`); when the tower exists change its `match.area` and the `gotoArea` of `ev_elise_wake` | 114–118 |
| `ossuary_now` | spawn `entry`; triggers `oss.coffins` · `oss.gap` (**`once: false`**) · `oss.arena` (`wake: 'oss_arena'`) · `oss.lamp` · `boss.enter`; interact `oss.riddle` (kind `sign`), `rest` with **id `boss_rest`**, three room bells and the arena bell (kind `bell`, event `bell.ring`); actor `sera` (`talk: 'sera.ossuary'`, `when: 'sera_follows'`); the boss raises `boss.phase` | 68–114 |
| `ossuary_past` | same layout; interact `oss.wedge` (kind `pull`, the statue (석상) / wooden crate choice), four bell posts `oss.knell` with `data: { post: 1..4 }`, `oss.elise` (the sleeping girl, after the queen is sent); the same bells | 68–114 |

Flags the world may use in `when`: `door_pulled` · `street_clear` · `square_clear` (already used), `sera_follows`, `elise_found`. `street_clear` means "the main street of the night you are in is safe": it is cleared at the fall and set again when group `st_p` is cleared, so Edmund appears at the tavern door only after the fight. Area states for later (fires out after the ending): flag `bells_answered`.

Sound names the script asks for: `bell.toll` (opening) · `bell.crack`. Music ids: `TEXT.music`. Camera shots: `TEXT.shots` (eight cuts of GDD 9.2).

## 13. Status after the review (2026-11-18 00:20 UTC)

- `node tools/v2/story_check.mjs` → `OK: 0 errors, 0 warning(s)`; `node --expose-gc tools/v2/story_break.mjs` → all passed.
- Numbers: 25 people · 78 dialogue sets (158 variants, 294 pages) · 86 sequences (29 wait for areas, 6 bridges, 1 safety net) · 11 items · 23 objectives · 13 chronicle entries · 43 flags · 24 tutorial prompts · 556 distinct Hangul syllables, 11 new to the fonts (`넜닭댓둡딨밧뵌샌앓칩켠`).
- The numbers in the older status below are from before the review.

## 13b. Status before the review (2026-11-18 00:00 UTC)

- `node tools/v2/story_check.mjs` → exit 0. It checks: the folder rules (imports, no browser / Node API), every table against this document, people ↔ model and portrait files, talk keys ↔ area actors, sequence hooks ↔ triggers / interact / exits / enemy groups of the built areas (imported read-only), flags (declared, set, read, lists in sync), items (given before taken), no orphan dialogue, no unreachable sequence, the page rule (2 lines × 30), years and names written one way, button names in tutorial text, the Hangul the fonts lack, and four plays of the whole first release against a fake api: route A (as designed), route B (only built areas, through the bridges, the other branch of both choices), and both again with every callback answered later (dialogue, camera, area change). Save → load → continue is exercised three times per play.
- Outputs: `/tmp/claude-0/v2/story/transcript.txt` (route A) · `transcript_bridge.txt` (route B) · `script_owner.md` · `font_new_chars.txt` · `report.json`.
- Numbers: 25 people · 73 dialogue sets · 75 sequences (27 wait for the bell tower / ossuary / one hook, 4 bridges) · 11 items · 22 objectives · 13 chronicle entries (8 written or filled in the first release, 5 blanks stay open) · 43 flags · 24 tutorial prompts.
- Font cost when the folder moves under `src/`: 11 new Hangul syllables (`넜닭댓둡딨밧뵌샌앓칩켠`), no other new characters.
